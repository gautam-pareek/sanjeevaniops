"""
Health checker — executes all health check types.

Checks supported:
  1. HTTP status code
  2. HTTP response time threshold (warn >3s, critical >5s)
  3. HTTP keyword detection in response body
  4. Container restart count (crash-looping detection)
  5. Multi-endpoint reachability
  6. API connectivity + JSON validation
  + TCP, Exec, Docker Native (unchanged)
"""

import json
import socket
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import docker
import requests
from docker.errors import DockerException, NotFound


@dataclass
class SubCheckResult:
    name: str
    passed: bool
    message: str


@dataclass
class CheckResult:
    status: str                          # 'healthy' | 'unhealthy' | 'timeout' | 'error'
    response_time_ms: Optional[int]
    error_message: Optional[str]
    sub_checks: List[SubCheckResult] = field(default_factory=list)


class HealthChecker:

    def __init__(self):
        try:
            self._docker = docker.from_env()
            self._docker.ping()
            self._docker_available = True
        except DockerException:
            self._docker = None
            self._docker_available = False
        self._restart_counts: Dict[str, int] = {}

    def run_check(self, check_type: str, config: Dict[str, Any], container_name: str) -> CheckResult:
        if check_type == "http":
            return self._check_http(config, container_name)
        elif check_type == "tcp":
            return self._check_tcp(config)
        elif check_type == "exec":
            return self._check_exec(config, container_name)
        elif check_type == "docker_native":
            return self._check_docker_native(container_name)
        return CheckResult(status="error", response_time_ms=None,
                           error_message=f"Unknown check type: {check_type}")

    # ── HTTP check (enhanced) ─────────────────────────────────────────

    def _check_http(self, config: Dict[str, Any], container_name: str) -> CheckResult:
        import logging
        logger = logging.getLogger(__name__)
        logger.debug("_check_http config keys: %s", list(config.keys()))

        url = config["url"]
        method = config.get("method", "GET").upper()
        expected_codes = config.get("expected_status_codes", [200])
        headers = config.get("headers") or {}
        follow_redirects = config.get("follow_redirects", False)
        timeout = config.get("timeout_seconds", 5)
        warn_ms = config.get("warn_response_time_ms", 3000)
        critical_ms = config.get("critical_response_time_ms", 5000)
        # Always run keyword check — use config value or safe defaults
        error_keywords = config.get("error_keywords") or [
            "error", "exception", "fatal", "traceback",
            "500 internal server error", "something went wrong",
            "service unavailable", "bad gateway"
        ]
        additional_endpoints = config.get("additional_endpoints") or []
        expect_json = config.get("expect_json", False)

        sub_checks: List[SubCheckResult] = []
        overall_status = "healthy"
        elapsed_ms = None

        start = time.monotonic()
        try:
            response = requests.request(
                method=method, url=url, headers=headers,
                allow_redirects=follow_redirects, timeout=timeout,
            )
            elapsed_ms = int((time.monotonic() - start) * 1000)

            # Check 1: Status code
            status_ok = response.status_code in expected_codes
            sub_checks.append(SubCheckResult(
                name="HTTP Status", passed=status_ok,
                message=f"Status {response.status_code}" + ("" if status_ok else f" — expected {expected_codes}"),
            ))
            if not status_ok:
                overall_status = "unhealthy"

            # Check 2: Response time
            if elapsed_ms >= critical_ms:
                sub_checks.append(SubCheckResult(
                    name="Response Time", passed=False,
                    message=f"{elapsed_ms}ms — critical (>{critical_ms}ms)",
                ))
                overall_status = "unhealthy"
            elif elapsed_ms >= warn_ms:
                sub_checks.append(SubCheckResult(
                    name="Response Time", passed=False,
                    message=f"{elapsed_ms}ms — slow (>{warn_ms}ms)",
                ))
                overall_status = "unhealthy"
            else:
                sub_checks.append(SubCheckResult(
                    name="Response Time", passed=True,
                    message=f"{elapsed_ms}ms",
                ))

            # Check 3: Error keywords in body
            body_lower = response.text.lower()
            found = [kw for kw in error_keywords if kw.lower() in body_lower]
            if found:
                sub_checks.append(SubCheckResult(
                    name="Body Keywords", passed=False,
                    message=f"Error keywords found: {', '.join(found[:3])}",
                ))
                overall_status = "unhealthy"
            else:
                sub_checks.append(SubCheckResult(
                    name="Body Keywords", passed=True,
                    message="No error keywords detected",
                ))

            # Check 6: JSON validation
            if expect_json:
                try:
                    response.json()
                    sub_checks.append(SubCheckResult(
                        name="JSON Response", passed=True, message="Valid JSON"))
                except (json.JSONDecodeError, ValueError):
                    sub_checks.append(SubCheckResult(
                        name="JSON Response", passed=False,
                        message=f"Invalid JSON — content-type: {response.headers.get('content-type', 'unknown')}",
                    ))
                    overall_status = "unhealthy"

        except requests.exceptions.Timeout:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            sub_checks.append(SubCheckResult(
                name="HTTP Status", passed=False, message=f"Timed out after {timeout}s"))
            return CheckResult(status="timeout", response_time_ms=elapsed_ms,
                               error_message=f"Request timed out after {timeout}s", sub_checks=sub_checks)
        except requests.exceptions.ConnectionError as e:
            sub_checks.append(SubCheckResult(
                name="HTTP Status", passed=False, message=f"Connection refused"))
            return CheckResult(status="error", response_time_ms=None,
                               error_message=f"Connection error: {str(e)[:200]}", sub_checks=sub_checks)
        except Exception as e:
            return CheckResult(status="error", response_time_ms=None,
                               error_message=f"Unexpected error: {str(e)[:200]}", sub_checks=sub_checks)

        # Check 4: Container restart count
        rc = self._check_restart_count(container_name)
        sub_checks.append(rc)
        if not rc.passed:
            overall_status = "unhealthy"

        # Check 5: Additional endpoints
        for ep in additional_endpoints[:5]:
            ep_url = ep if ep.startswith("http") else f"{url.rstrip('/')}/{ep.lstrip('/')}"
            ep_result = self._check_single_endpoint(ep_url, timeout, error_keywords)
            sub_checks.append(ep_result)
            if not ep_result.passed:
                overall_status = "unhealthy"

        failed = [sc for sc in sub_checks if not sc.passed]
        error_msg = " | ".join(f"{sc.name}: {sc.message}" for sc in failed[:3]) if failed else None

        return CheckResult(
            status=overall_status,
            response_time_ms=elapsed_ms,
            error_message=error_msg,
            sub_checks=sub_checks,
        )

    def _check_restart_count(self, container_name: str) -> SubCheckResult:
        if not self._docker_available or not container_name:
            return SubCheckResult(name="Restart Count", passed=True, message="Skipped")
        try:
            container = self._docker.containers.get(container_name)
            current = container.attrs.get("RestartCount", 0)
            prev = self._restart_counts.get(container_name, current)
            self._restart_counts[container_name] = current
            if current > prev:
                return SubCheckResult(
                    name="Restart Count", passed=False,
                    message=f"Restarted {current - prev}x since last check (total: {current})")
            return SubCheckResult(
                name="Restart Count", passed=True, message=f"Stable — {current} total restart(s)")
        except NotFound:
            return SubCheckResult(
                name="Restart Count", passed=False, message=f"Container '{container_name}' not found")
        except Exception as e:
            return SubCheckResult(
                name="Restart Count", passed=True, message=f"Could not check: {str(e)[:80]}")

    def _check_single_endpoint(
        self, url: str, timeout: int, error_keywords: list = None
    ) -> SubCheckResult:
        try:
            resp = requests.get(url, timeout=timeout, allow_redirects=True)

            # Status code check
            if resp.status_code >= 400:
                # Detect broken redirect chains (e.g. 302 → typo URL → 404)
                if resp.history:
                    redirect_codes = " → ".join(str(r.status_code) for r in resp.history)
                    final_url = resp.url
                    return SubCheckResult(
                        name="Endpoint", passed=False,
                        message=f"{url} → {redirect_codes} → {final_url} → {resp.status_code} (broken redirect)"
                    )
                return SubCheckResult(name="Endpoint", passed=False,
                                      message=f"{url} → {resp.status_code}")

            # Body keyword check — catches error pages that return 200
            keywords = error_keywords or [
                "internal server error", "typeerror", "exception",
                "traceback", "fatal", "something went wrong",
                "uncaught", "unhandled", "service unavailable",
                "bad gateway", "payment", "500"
            ]
            body_lower = resp.text.lower()
            found = [kw for kw in keywords if kw.lower() in body_lower]
            if found:
                return SubCheckResult(name="Endpoint", passed=False,
                                      message=f"{url} → 200 but body contains error: '{found[0]}'")

            return SubCheckResult(name="Endpoint", passed=True,
                                  message=f"{url} → {resp.status_code} OK")
        except requests.exceptions.Timeout:
            return SubCheckResult(name="Endpoint", passed=False,
                                  message=f"{url} timed out")
        except Exception as e:
            return SubCheckResult(name="Endpoint", passed=False,
                                  message=f"{url} unreachable — {str(e)[:80]}")

    # ── TCP (unchanged) ───────────────────────────────────────────────

    def _check_tcp(self, config: Dict[str, Any]) -> CheckResult:
        host = config.get("host", "localhost")
        port = config["port"]
        timeout = config.get("timeout_seconds", 5)
        start = time.monotonic()
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return CheckResult(status="healthy",
                                   response_time_ms=int((time.monotonic() - start) * 1000),
                                   error_message=None)
        except socket.timeout:
            return CheckResult(status="timeout",
                               response_time_ms=int((time.monotonic() - start) * 1000),
                               error_message=f"TCP timed out after {timeout}s")
        except ConnectionRefusedError:
            return CheckResult(status="unhealthy", response_time_ms=None,
                               error_message=f"Connection refused on {host}:{port}")
        except Exception as e:
            return CheckResult(status="error", response_time_ms=None,
                               error_message=f"TCP error: {str(e)}")

    # ── Exec (unchanged) ──────────────────────────────────────────────

    def _check_exec(self, config: Dict[str, Any], container_name: str) -> CheckResult:
        if not self._docker_available:
            return CheckResult(status="error", response_time_ms=None,
                               error_message="Docker unavailable")
        start = time.monotonic()
        try:
            container = self._docker.containers.get(container_name)
            exit_code, output = container.exec_run(
                cmd=config["command"], demux=False,
                timeout=config.get("timeout_seconds", 5))
            elapsed_ms = int((time.monotonic() - start) * 1000)
            expected = config.get("expected_exit_code", 0)
            if exit_code == expected:
                return CheckResult(status="healthy", response_time_ms=elapsed_ms, error_message=None)
            out = output.decode("utf-8", errors="replace").strip()[:200] if output else ""
            return CheckResult(status="unhealthy", response_time_ms=elapsed_ms,
                               error_message=f"Exit code {exit_code}. Output: {out}")
        except NotFound:
            return CheckResult(status="error", response_time_ms=None,
                               error_message=f"Container '{container_name}' not found")
        except Exception as e:
            return CheckResult(status="error", response_time_ms=None,
                               error_message=f"Exec error: {str(e)}")

    # ── Docker Native (unchanged) ─────────────────────────────────────

    def _check_docker_native(self, container_name: str) -> CheckResult:
        if not self._docker_available:
            return CheckResult(status="error", response_time_ms=None,
                               error_message="Docker unavailable")
        start = time.monotonic()
        try:
            container = self._docker.containers.get(container_name)
            health = container.attrs.get("State", {}).get("Health")
            elapsed_ms = int((time.monotonic() - start) * 1000)
            if health is None:
                return CheckResult(status="error", response_time_ms=elapsed_ms,
                                   error_message="No HEALTHCHECK defined in image")
            status = health.get("Status", "none").lower()
            if status == "healthy":
                return CheckResult(status="healthy", response_time_ms=elapsed_ms, error_message=None)
            logs = health.get("Log") or []
            last = logs[-1].get("Output", "").strip()[:200] if logs else ""
            return CheckResult(status="unhealthy", response_time_ms=elapsed_ms,
                               error_message=f"Docker status: {status}. {last}")
        except NotFound:
            return CheckResult(status="error", response_time_ms=None,
                               error_message=f"Container '{container_name}' not found")
        except Exception as e:
            return CheckResult(status="error", response_time_ms=None,
                               error_message=f"Docker native error: {str(e)}")
