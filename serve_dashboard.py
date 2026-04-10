"""Serve the dashboard directory with no-cache headers."""
import http.server
import os

PORT = 3000
DIRECTORY = os.path.join(os.path.dirname(__file__), "dashboard")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        pass  # suppress access log noise


if __name__ == "__main__":
    with http.server.HTTPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"Dashboard: http://localhost:{PORT}")
        httpd.serve_forever()
