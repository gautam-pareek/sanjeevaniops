"""
AI Log Analysis Engine.
Uses local Ollama to analyze crash event logs and provide
root-cause analysis + structured fix suggestions.

Model is configured via settings.ollama_model (default: gemma4:e2b).
Change to "phi3:mini" in backend/core/config.py if gemma4 is unavailable.
"""

import json
import logging
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Lazy-import settings to avoid circular import at module load
def _get_settings():
    from backend.core.config import settings
    return settings


# ── Prompt: structured fix suggestion (JSON output) ──────────────────────────
FIX_SUGGESTION_PROMPT = """\
Container "{container_name}" has a health check failure.

Detected issue: {crash_reason}

Health check sub-check details:
{health_context}

You are a DevOps expert. Your task is to provide a recovery playbook.
Respond ONLY with a valid JSON object. No pre-amble, no post-amble, no markdown formatting outside the JSON block.

CRITICAL RULES:
1. ONLY suggest actions based on the detected issue ({crash_reason}).
2. If the health context is empty, suggest generic diagnostic steps (logs, inspect).
3. Do not invent port numbers or file paths not mentioned in the context or standard for the container type.
4. Ensure all JSON fields are present.

{{
  "steps": [
    "Step 1: specific diagnostic or fix action",
    "Step 2: ...",
    "Step 3: ..."
  ],
  "files_to_check": ["List of relevant filenames"],
  "commands": [
    "docker logs {container_name} --tail 100",
    "docker inspect {container_name}"
  ],
  "quick_check": "A simple curl or command to verify the fix"
}}"""

# ── Prompt: log-only fallback (no health check data) ─────────────────────────
ANALYSIS_PROMPT_LOGS_ONLY = """\
You are a DevOps AI assistant. Analyze these container logs to diagnose the issue.

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

    def __init__(self):
        # Read config lazily so tests/imports don't require settings at load time
        s = _get_settings()
        self.base_url = s.ollama_base_url.rstrip("/")
        self.model = s.ollama_model
        self.timeout = s.ollama_timeout
        self._resolved_model = None  # Actual tag from Ollama (set by is_available)

    def is_available(self) -> bool:
        """Check if Ollama is running and the configured model is installed.

        Never changes self.model — only reports True/False.
        Use list_installed_models() to see what is available when this returns False.
        """
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if r.status_code != 200:
                return False
            models = [m["name"] for m in r.json().get("models", [])]

            # Exact match, or Ollama appended ":latest" to the name
            for m in models:
                if m == self.model or m == self.model + ":latest":
                    self._resolved_model = m
                    return True
            return False
        except Exception:
            return False

    def list_installed_models(self) -> list:
        """Return all model names Ollama has installed locally. Empty list if unreachable."""
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if r.status_code == 200:
                return [m["name"] for m in r.json().get("models", [])]
        except Exception:
            pass
        return []

    def _get_model_name(self) -> str:
        """Return the exact model tag Ollama knows about."""
        return self._resolved_model or self.model

    # ── Crash analysis (used as fallback when no health check data) ──────────

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
        Analyze using container logs (fallback path — health-check-first is preferred).
        """
        if container_logs and container_logs.strip():
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
                "error": "No logs available to analyze",
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
            }

        if previous_analysis:
            prompt += f"\n\nPrevious analysis found: {previous_analysis}"

        return self._call_ollama(prompt, max_tokens=300)

    # ── Structured fix suggestion (primary AI path) ───────────────────────────

    def get_fix_suggestion(
        self,
        container_name: str,
        crash_reason: str,
        health_context: Optional[str] = None,
        container_logs: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Ask AI for a structured fix suggestion given a known crash reason.
        crash_reason is built deterministically from health check data.
        health_context (sub-checks) is the primary evidence.
        container_logs is supplementary — appended after sub-checks.

        Returns a dict with keys: steps, files_to_check, commands, quick_check
        Returns None if AI is unavailable or response cannot be parsed.
        """
        if not self.is_available():
            return None

        model_name = self._get_model_name()

        # Build context: sub-checks first (primary), logs second (supplementary)
        context_parts = []
        if health_context:
            context_parts.append(f"Health check sub-checks:\n{health_context}")
        else:
            context_parts.append("No sub-check data available.")
        if container_logs and container_logs.strip():
            truncated = container_logs[-1500:] if len(container_logs) > 1500 else container_logs
            context_parts.append(f"Recent container logs (last 100 lines):\n{truncated}")

        context = "\n\n".join(context_parts)
        prompt = FIX_SUGGESTION_PROMPT.format(
            container_name=container_name,
            crash_reason=crash_reason,
            health_context=context,
        )

        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_predict": 400,
                    },
                },
                timeout=self.timeout,
            )
            if response.status_code == 200:
                raw = response.json().get("response", "").strip()
                parsed = self._parse_json_response(raw)
                # Validate it has the expected shape
                if isinstance(parsed, dict) and "steps" in parsed:
                    return parsed
                # If model returned plain text, wrap it
                if isinstance(parsed, dict) and "suggested_fix" in parsed:
                    return {"steps": [parsed["suggested_fix"]], "files_to_check": [], "commands": [], "quick_check": ""}
                # Raw string fallback
                if raw:
                    return {"steps": [raw[:300]], "files_to_check": [], "commands": [], "quick_check": ""}
            return None
        except Exception as e:
            logger.warning("AI fix suggestion failed: %s", e)
            return None

    # ── Chat (scoped DevOps assistant) ────────────────────────────────────────

    def chat(self, message: str, context: str = "") -> Dict[str, Any]:
        """Chat with the AI assistant. Scoped to DevOps/monitoring topics only."""
        if not message or not message.strip():
            return {"success": False, "response": "Please enter a message."}

        system_prompt = CHAT_SYSTEM_PROMPT
        if context:
            system_prompt += f"\n\nCurrent system context:\n{context}"

        model_name = self._get_model_name()

        # Try /api/chat first (supports system/user message roles)
        try:
            response = requests.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": model_name,
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

            if response.status_code == 200:
                reply = response.json().get("message", {}).get("content", "").strip()
                return {"success": True, "response": reply or "No response generated."}

            # If chat endpoint fails (500 = model may not support chat template),
            # fall back to /api/generate with prompt-based approach
            logger.warning("Chat API returned %s, falling back to generate API", response.status_code)

        except requests.exceptions.ConnectionError:
            return {"success": False, "response": "Ollama is not running. Start it with: ollama serve"}
        except requests.exceptions.Timeout:
            return {"success": False, "response": "Request timed out. Try again."}
        except Exception as e:
            logger.warning("Chat API error: %s, falling back to generate", e)

        # ── Fallback: use /api/generate (works with all models) ──────────────
        try:
            prompt = f"{system_prompt}\n\nUser: {message}\nAssistant:"
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 500,
                    },
                },
                timeout=self.timeout,
            )

            if response.status_code == 200:
                reply = response.json().get("response", "").strip()
                return {"success": True, "response": reply or "No response generated."}

            # Extract actual error from Ollama response
            try:
                err_detail = response.json().get("error", response.text[:200])
            except Exception:
                err_detail = response.text[:200]
            return {"success": False, "response": self._friendly_error(err_detail)}

        except requests.exceptions.ConnectionError:
            return {"success": False, "response": "Ollama is not running. Start it with: ollama serve"}
        except requests.exceptions.Timeout:
            return {"success": False, "response": "Request timed out. Try again."}
        except Exception as e:
            return {"success": False, "response": str(e)}

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _friendly_error(self, raw_error: str) -> str:
        """Translate known Ollama error strings into actionable user messages."""
        err = raw_error.lower()
        if "requires more system memory" in err or "not enough memory" in err or "out of memory" in err:
            return (
                f"The selected model is too large for available RAM ({raw_error.strip()}). "
                "Switch to a smaller model in the AI Engine tab — "
                "try: ollama pull llama3.2:1b  (1.3 GB) or  ollama pull phi3:mini  (2.3 GB)"
            )
        if "model not found" in err or "pull model" in err:
            return (
                f"Model not found locally: {self.model}. "
                f"Run: ollama pull {self.model}  — or pick an installed model from the AI Engine tab."
            )
        if "connection refused" in err or "failed to connect" in err:
            return "Ollama is not running. Start it with: ollama serve"
        return f"AI engine error: {raw_error}"

    def _call_ollama(self, prompt: str, max_tokens: int = 300) -> Dict[str, Any]:
        """Generic Ollama generate call."""
        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1, "num_predict": max_tokens},
                },
                timeout=self.timeout,
            )

            if response.status_code != 200:
                try:
                    err_detail = response.json().get("error", response.text[:200])
                except Exception:
                    err_detail = response.text[:200]
                return {
                    "success": False,
                    "error": self._friendly_error(err_detail),
                    "analyzed_at": datetime.now(timezone.utc).isoformat(),
                }

            raw_text = response.json().get("response", "").strip()
            analysis = self._parse_json_response(raw_text)
            analysis["analyzed_at"] = datetime.now(timezone.utc).isoformat()
            analysis["model_used"] = self.model
            analysis["success"] = True
            return analysis

        except requests.exceptions.ConnectionError:
            return {"success": False, "error": "Ollama is not running. Start it with: ollama serve",
                    "analyzed_at": datetime.now(timezone.utc).isoformat()}
        except requests.exceptions.Timeout:
            return {"success": False, "error": "Analysis timed out. The model may be loading — try again.",
                    "analyzed_at": datetime.now(timezone.utc).isoformat()}
        except Exception as e:
            logger.exception("Unexpected error during AI analysis")
            return {"success": False, "error": str(e),
                    "analyzed_at": datetime.now(timezone.utc).isoformat()}

    def _parse_json_response(self, raw_text: str) -> Dict[str, Any]:
        """Parse the LLM response, extracting JSON from potentially noisy output."""
        # Direct JSON parse
        try:
            return json.loads(raw_text)
        except (json.JSONDecodeError, ValueError):
            pass

        # Extract from markdown code block ```json ... ```
        import re
        json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except (json.JSONDecodeError, ValueError):
                pass

        # Find first { ... } block
        brace_match = re.search(r"\{[^{}]*\}", raw_text, re.DOTALL)
        if brace_match:
            try:
                return json.loads(brace_match.group(0))
            except (json.JSONDecodeError, ValueError):
                pass

        # Fallback: return raw text
        logger.warning("Could not parse JSON from LLM response, using raw text")
        return {
            "crash_reason": raw_text[:500] if raw_text else "Unknown",
            "suggested_fix": "Could not parse structured response from AI model.",
            "severity": "unknown",
            "category": "unknown",
        }


CHAT_SYSTEM_PROMPT = """\
You are SanjeevaniOps AI Assistant — a strictly scoped DevOps support agent.

RULES (never break these):
1. ONLY answer questions about: Docker containers, application health monitoring, crash log analysis, server troubleshooting, deployment issues, SanjeevaniOps dashboard usage, and related DevOps topics.
2. If the user asks about ANYTHING ELSE (e.g., general knowledge, coding help unrelated to DevOps, personal questions, jokes, math, etc.), respond ONLY with: "I'm the SanjeevaniOps AI Assistant. I can only help with container monitoring, crash analysis, and DevOps troubleshooting. Please ask me something related to your application health!"
3. Keep answers concise, practical, and actionable.
4. When discussing crash logs, suggest specific debugging steps.
5. Reference SanjeevaniOps features when relevant (health checks, crash events, monitoring endpoints).

You are an expert in: Docker, Nginx, application health monitoring, crash diagnostics, container management, log analysis, and DevOps best practices."""


# Module-level singleton
ai_service = AIService()
