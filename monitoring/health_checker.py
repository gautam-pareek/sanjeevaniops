"""
Health checker.
Executes health checks for each supported type:
  - HTTP
  - TCP
  - Exec (command inside container)
  - Docker Native (reads Docker's own healthcheck status)

All methods return a CheckResult dataclass.
No side effects — purely runs a check and returns the outcome.
"""

import socket
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import docker
import requests
from docker.errors import DockerException, NotFound


@dataclass
class CheckResult:
    """Result of a single health check execution."""
    status: str                         # 'healthy' | 'unhealthy' | 'timeout' | 'error'
    response_time_ms: Optional[int]     # None if check never connected
    error_message: Optional[str]        # None on success


class HealthChecker:
    """Executes health checks against registered applications."""

    def __init__(self):
        """Initialise Docker client (used for Exec and Docker Native checks)."""
        try:
            self._docker = docker.from_env()
            self._docker.ping()
            self._docker_available = True
        except DockerException:
            self._docker = None
            self._docker_available = False

    # ------------------------------------------------------------------
    # Public dispatch method
    # ------------------------------------------------------------------

    def run_check(
        self, check_type: str, config: Dict[str, Any], container_name: str
    ) -> CheckResult:
        """
        Dispatch to the correct check method based on type.

        Args:
            check_type: 'http' | 'tcp' | 'exec' | 'docker_native'
            config:     Type-specific config dict (from health_check_config)
            container_name: Docker container name (needed for exec/docker_native)
        """
        if check_type == "http":
            return self._check_http(config)
        elif check_type == "tcp":
            return self._check_tcp(config)
        elif check_type == "exec":
            return self._check_exec(config, container_name)
        elif check_type == "docker_native":
            return self._check_docker_native(container_name)
        else:
            return CheckResult(
                status="error",
                response_time_ms=None,
                error_message=f"Unknown health check type: {check_type}",
            )

    # ------------------------------------------------------------------
    # HTTP check
    # ------------------------------------------------------------------

    def _check_http(self, config: Dict[str, Any]) -> CheckResult:
        """
        Perform an HTTP/HTTPS health check.

        Config keys:
          url                  (str)       required
          method               (str)       default GET
          expected_status_codes ([int])    default [200]
          headers              (dict)      optional
          follow_redirects     (bool)      default False
          timeout_seconds      (int)       default 5
        """
        url = config["url"]
        method = config.get("method", "GET").upper()
        expected_codes = config.get("expected_status_codes", [200])
        headers = config.get("headers") or {}
        follow_redirects = config.get("follow_redirects", False)
        timeout = config.get("timeout_seconds", 5)

        start = time.monotonic()
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                allow_redirects=follow_redirects,
                timeout=timeout,
            )
            elapsed_ms = int((time.monotonic() - start) * 1000)

            if response.status_code in expected_codes:
                return CheckResult(
                    status="healthy",
                    response_time_ms=elapsed_ms,
                    error_message=None,
                )
            else:
                return CheckResult(
                    status="unhealthy",
                    response_time_ms=elapsed_ms,
                    error_message=(
                        f"Unexpected status code {response.status_code}. "
                        f"Expected one of {expected_codes}."
                    ),
                )

        except requests.exceptions.Timeout:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            return CheckResult(
                status="timeout",
                response_time_ms=elapsed_ms,
                error_message=f"HTTP request timed out after {timeout}s",
            )
        except requests.exceptions.ConnectionError as e:
            return CheckResult(
                status="error",
                response_time_ms=None,
                error_message=f"Connection error: {str(e)}",
            )
        except Exception as e:
            return CheckResult(
                status="error",
                response_time_ms=None,
                error_message=f"Unexpected error: {str(e)}",
            )

    # ------------------------------------------------------------------
    # TCP check
    # ------------------------------------------------------------------

    def _check_tcp(self, config: Dict[str, Any]) -> CheckResult:
        """
        Perform a TCP port connectivity check.

        Config keys:
          host             (str)   default 'localhost'
          port             (int)   required
          timeout_seconds  (int)   default 5
        """
        host = config.get("host", "localhost")
        port = config["port"]
        timeout = config.get("timeout_seconds", 5)

        start = time.monotonic()
        try:
            with socket.create_connection((host, port), timeout=timeout):
                elapsed_ms = int((time.monotonic() - start) * 1000)
                return CheckResult(
                    status="healthy",
                    response_time_ms=elapsed_ms,
                    error_message=None,
                )
        except socket.timeout:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            return CheckResult(
                status="timeout",
                response_time_ms=elapsed_ms,
                error_message=f"TCP connection timed out after {timeout}s",
            )
        except ConnectionRefusedError:
            return CheckResult(
                status="unhealthy",
                response_time_ms=None,
                error_message=f"Connection refused on {host}:{port}",
            )
        except Exception as e:
            return CheckResult(
                status="error",
                response_time_ms=None,
                error_message=f"TCP check error: {str(e)}",
            )

    # ------------------------------------------------------------------
    # Exec check
    # ------------------------------------------------------------------

    def _check_exec(
        self, config: Dict[str, Any], container_name: str
    ) -> CheckResult:
        """
        Run a command inside the container and check exit code.

        Config keys:
          command              (str)   required
          expected_exit_code   (int)   default 0
          timeout_seconds      (int)   default 5
        """
        if not self._docker_available:
            return CheckResult(
                status="error",
                response_time_ms=None,
                error_message="Docker daemon unavailable — cannot run exec check",
            )

        command = config["command"]
        expected_exit = config.get("expected_exit_code", 0)
        timeout = config.get("timeout_seconds", 5)

        start = time.monotonic()
        try:
            container = self._docker.containers.get(container_name)
            exit_code, output = container.exec_run(
                cmd=command,
                demux=False,
                timeout=timeout,
            )
            elapsed_ms = int((time.monotonic() - start) * 1000)

            if exit_code == expected_exit:
                return CheckResult(
                    status="healthy",
                    response_time_ms=elapsed_ms,
                    error_message=None,
                )
            else:
                output_str = output.decode("utf-8", errors="replace").strip() if output else ""
                return CheckResult(
                    status="unhealthy",
                    response_time_ms=elapsed_ms,
                    error_message=(
                        f"Exit code {exit_code} (expected {expected_exit}). "
                        f"Output: {output_str[:200]}"
                    ),
                )

        except NotFound:
            return CheckResult(
                status="error",
                response_time_ms=None,
                error_message=f"Container '{container_name}' not found",
            )
        except Exception as e:
            return CheckResult(
                status="error",
                response_time_ms=None,
                error_message=f"Exec check error: {str(e)}",
            )

    # ------------------------------------------------------------------
    # Docker Native check
    # ------------------------------------------------------------------

    def _check_docker_native(self, container_name: str) -> CheckResult:
        """
        Read Docker's own HEALTHCHECK status from container inspect.

        Docker health states: 'healthy' | 'unhealthy' | 'starting' | 'none'
        """
        if not self._docker_available:
            return CheckResult(
                status="error",
                response_time_ms=None,
                error_message="Docker daemon unavailable — cannot read native health status",
            )

        start = time.monotonic()
        try:
            container = self._docker.containers.get(container_name)
            health = container.attrs.get("State", {}).get("Health")
            elapsed_ms = int((time.monotonic() - start) * 1000)

            if health is None:
                return CheckResult(
                    status="error",
                    response_time_ms=elapsed_ms,
                    error_message="Container has no HEALTHCHECK defined in its image",
                )

            docker_status = health.get("Status", "none").lower()

            if docker_status == "healthy":
                return CheckResult(
                    status="healthy",
                    response_time_ms=elapsed_ms,
                    error_message=None,
                )
            elif docker_status == "starting":
                return CheckResult(
                    status="unhealthy",
                    response_time_ms=elapsed_ms,
                    error_message="Container health check is still starting up",
                )
            else:
                # Get last log entry from Docker for context
                logs = health.get("Log") or []
                last_output = logs[-1].get("Output", "").strip() if logs else ""
                return CheckResult(
                    status="unhealthy",
                    response_time_ms=elapsed_ms,
                    error_message=f"Docker status: {docker_status}. {last_output[:200]}",
                )

        except NotFound:
            return CheckResult(
                status="error",
                response_time_ms=None,
                error_message=f"Container '{container_name}' not found",
            )
        except Exception as e:
            return CheckResult(
                status="error",
                response_time_ms=None,
                error_message=f"Docker native check error: {str(e)}",
            )
