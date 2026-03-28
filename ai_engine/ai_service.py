"""
AI Log Analysis Engine.
Uses local Ollama (LLaMA 3.2 1B) to analyze crash event logs
and provide root-cause analysis + suggested fixes.
"""

import json
import logging
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Default Ollama configuration
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3.2:1b"
OLLAMA_TIMEOUT = 120  # seconds — small model, but long logs may take time

ANALYSIS_PROMPT_WITH_HEALTH_CHECKS = """You are a DevOps AI assistant. The monitoring system detected that container "{container_name}" became unhealthy.

Container status: {container_status}
Exit code: {exit_code}

The monitoring system ran these health checks and found these failures:

{health_checks}

Based ONLY on the health check failures listed above, respond with valid JSON:
{{
  "crash_reason": "Explain what failed based on the health check results above",
  "suggested_fix": "Steps to fix the specific failures detected",
  "severity": "low|medium|high|critical",
  "category": "configuration|dependency|resource|network|application_bug|unknown"
}}"""

ANALYSIS_PROMPT_LOGS_ONLY = """You are a DevOps AI assistant. Analyze these container logs to diagnose the issue.

Container: {container_name}
Status: {container_status}
Exit Code: {exit_code}

Logs:
{logs}

If the logs only show normal access logs (200 OK), say "Container logs appear normal — issue may be in application configuration."

Respond with valid JSON only:
{{
  "crash_reason": "Brief explanation based on evidence in the logs",
  "suggested_fix": "Steps to fix the issue",
  "severity": "low|medium|high|critical",
  "category": "configuration|dependency|resource|network|application_bug|unknown"
}}"""


class AIService:
    """Service for AI-powered log analysis using local Ollama."""

    def __init__(
        self,
        base_url: str = OLLAMA_BASE_URL,
        model: str = OLLAMA_MODEL,
        timeout: int = OLLAMA_TIMEOUT,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def is_available(self) -> bool:
        """Check if Ollama is running and the model is available."""
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if r.status_code != 200:
                return False
            models = [m["name"] for m in r.json().get("models", [])]
            return any(self.model in m for m in models)
        except Exception:
            return False

    def analyze_logs(
        self,
        container_name: str,
        container_logs: str,
        container_status: str = "unknown",
        exit_code: Optional[int] = None,
        previous_analysis: Optional[str] = None,
        health_check_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Analyze using health check results (preferred) or container logs (fallback).
        When health check data is available, container logs are NOT sent to avoid confusion.
        """
        # Choose prompt based on available data
        if health_check_context:
            # ONLY send health check data — no container logs (prevents hallucination)
            prompt = ANALYSIS_PROMPT_WITH_HEALTH_CHECKS.format(
                container_name=container_name,
                container_status=container_status,
                exit_code=exit_code if exit_code is not None else "N/A",
                health_checks=health_check_context,
            )
        elif container_logs and container_logs.strip():
            # Fallback: use container logs only when no health check data
            truncated = container_logs[-2000:] if len(container_logs) > 2000 else container_logs
            prompt = ANALYSIS_PROMPT_LOGS_ONLY.format(
                container_name=container_name,
                container_status=container_status,
                exit_code=exit_code if exit_code is not None else "N/A",
                logs=truncated,
            )
        else:
            return {
                "success": False,
                "error": "No health check data or logs available to analyze",
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
            }

        if previous_analysis:
            prompt += f"\n\nPrevious analysis found: {previous_analysis}"

        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,  # Low temperature for consistent output
                        "num_predict": 300,   # Limit output length
                    },
                },
                timeout=self.timeout,
            )

            if response.status_code != 200:
                logger.error("Ollama returned status %d: %s", response.status_code, response.text[:200])
                return {
                    "success": False,
                    "error": f"Ollama returned status {response.status_code}",
                    "analyzed_at": datetime.now(timezone.utc).isoformat(),
                }

            raw_text = response.json().get("response", "").strip()
            analysis = self._parse_response(raw_text)
            analysis["analyzed_at"] = datetime.now(timezone.utc).isoformat()
            analysis["model_used"] = self.model
            analysis["success"] = True
            return analysis

        except requests.exceptions.ConnectionError:
            logger.error("Cannot connect to Ollama at %s", self.base_url)
            return {
                "success": False,
                "error": "Ollama is not running. Start it with: ollama serve",
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
            }
        except requests.exceptions.Timeout:
            logger.error("Ollama request timed out after %ds", self.timeout)
            return {
                "success": False,
                "error": "Analysis timed out. The model may be loading — try again.",
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.exception("Unexpected error during AI analysis")
            return {
                "success": False,
                "error": str(e),
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
            }

    def _parse_response(self, raw_text: str) -> Dict[str, Any]:
        """Parse the LLM response, extracting JSON from potentially noisy output."""
        # Try direct JSON parse first
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            pass

        # Try extracting JSON from markdown code block ```json ... ```
        import re
        json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try finding first { ... } block
        brace_match = re.search(r"\{[^{}]*\}", raw_text, re.DOTALL)
        if brace_match:
            try:
                return json.loads(brace_match.group(0))
            except json.JSONDecodeError:
                pass

        # Fallback: return raw text as the analysis
        logger.warning("Could not parse JSON from LLM response, using raw text")
        return {
            "crash_reason": raw_text[:500],
            "suggested_fix": "Could not parse structured response from AI model.",
            "severity": "unknown",
            "category": "unknown",
        }

    def get_fix_suggestion(
        self,
        container_name: str,
        crash_reason: str,
        health_context: Optional[str] = None,
    ) -> Optional[str]:
        """
        Ask AI ONLY for a suggested fix, given a known crash reason.
        The crash_reason is built deterministically from health check data.
        Returns a fix suggestion string, or None if AI is unavailable.
        """
        if not self.is_available():
            return None

        prompt = f"""Container "{container_name}" became unhealthy.

The monitoring system detected these failures:
{crash_reason}
"""
        if health_context:
            prompt += f"""
Health check details:
{health_context}
"""
        prompt += """
Give a brief, actionable fix for this issue in 2-3 sentences. Be specific. Do not repeat the problem. Only provide the fix steps."""

        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_predict": 150,
                    },
                },
                timeout=self.timeout,
            )
            if response.status_code == 200:
                fix = response.json().get("response", "").strip()
                # Clean up: remove any JSON wrapper the model might add
                if fix.startswith("{"):
                    try:
                        parsed = json.loads(fix)
                        return parsed.get("suggested_fix", fix)
                    except json.JSONDecodeError:
                        pass
                return fix if fix else None
            return None
        except Exception as e:
            logger.warning("AI fix suggestion failed: %s", e)
            return None

    def chat(self, message: str, context: str = "") -> Dict[str, Any]:
        """
        Chat with the AI assistant. Scoped to DevOps/monitoring topics only.
        """
        if not message or not message.strip():
            return {"success": False, "response": "Please enter a message."}

        system_prompt = CHAT_SYSTEM_PROMPT
        if context:
            system_prompt += f"\n\nCurrent system context:\n{context}"

        try:
            response = requests.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": message},
                    ],
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 500,
                    },
                },
                timeout=self.timeout,
            )

            if response.status_code != 200:
                return {"success": False, "response": f"AI engine returned status {response.status_code}"}

            reply = response.json().get("message", {}).get("content", "").strip()
            return {"success": True, "response": reply or "No response generated."}

        except requests.exceptions.ConnectionError:
            return {"success": False, "response": "Ollama is not running. Start it with: ollama serve"}
        except requests.exceptions.Timeout:
            return {"success": False, "response": "Request timed out. Try again."}
        except Exception as e:
            return {"success": False, "response": str(e)}


CHAT_SYSTEM_PROMPT = """You are SanjeevaniOps AI Assistant — a strictly scoped DevOps support agent.

RULES (never break these):
1. ONLY answer questions about: Docker containers, application health monitoring, crash log analysis, server troubleshooting, deployment issues, SanjeevaniOps dashboard usage, and related DevOps topics.
2. If the user asks about ANYTHING ELSE (e.g., general knowledge, coding help unrelated to DevOps, personal questions, jokes, math, etc.), respond ONLY with: "I'm the SanjeevaniOps AI Assistant. I can only help with container monitoring, crash analysis, and DevOps troubleshooting. Please ask me something related to your application health!"
3. Keep answers concise, practical, and actionable.
4. When discussing crash logs, suggest specific debugging steps.
5. Reference SanjeevaniOps features when relevant (health checks, crash events, monitoring endpoints).

You are an expert in: Docker, Nginx, application health monitoring, crash diagnostics, container management, log analysis, and DevOps best practices."""


# Module-level singleton
ai_service = AIService()
