"""
Link crawler for auto endpoint discovery.

Crawls a base URL (GET-only, same-domain, depth-1, max 50 pages) using
only Python stdlib — no new dependencies.

Rules:
  - Only follows links where the netloc matches the base URL netloc.
  - Depth-1: discovers links found on the base page; does not recurse further.
  - Skips non-HTTP schemes, anchor-only fragments, and known binary extensions.
  - Returns deduplicated list of absolute URLs (path + query, no fragments).
"""

import logging
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import List

logger = logging.getLogger(__name__)

# File extensions that are never health-checkable endpoints
_SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
    ".pdf", ".zip", ".tar", ".gz", ".mp4", ".mp3",
}

_MAX_PAGES = 50
_PER_REQUEST_TIMEOUT = 5  # seconds


class _LinkExtractor(HTMLParser):
    """Minimal HTML parser that collects href attributes from <a> tags."""

    def __init__(self) -> None:
        super().__init__()
        self.links: List[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag == "a":
            for name, value in attrs:
                if name == "href" and value:
                    self.links.append(value)


def crawl(base_url: str, max_pages: int = _MAX_PAGES, timeout: int = _PER_REQUEST_TIMEOUT) -> List[str]:
    """
    Crawl base_url and return a deduplicated list of same-domain absolute URLs.

    Args:
        base_url:  The root URL to crawl (e.g. "http://localhost:8080").
        max_pages: Maximum number of URLs to return (default 50).
        timeout:   Per-request timeout in seconds (default 5).

    Returns:
        List of unique absolute URLs discovered (excluding base_url itself).
    """
    parsed_base = urllib.parse.urlparse(base_url)
    base_netloc = parsed_base.netloc

    if not base_netloc:
        logger.warning("crawl: invalid base_url %r — skipping", base_url)
        return []

    # Fetch the base page
    raw_links = _fetch_links(base_url, timeout)
    if raw_links is None:
        return []

    seen: set = set()
    results: List[str] = []

    for href in raw_links:
        if len(results) >= max_pages:
            break

        # Resolve relative hrefs against the base URL
        absolute = urllib.parse.urljoin(base_url, href)
        parsed = urllib.parse.urlparse(absolute)

        # Must be HTTP/HTTPS
        if parsed.scheme not in ("http", "https"):
            continue

        # Must be same domain
        if parsed.netloc != base_netloc:
            continue

        # Strip fragment (anchors don't represent separate endpoints)
        clean = urllib.parse.urlunparse(parsed._replace(fragment=""))

        # Skip the base URL itself
        if clean.rstrip("/") == base_url.rstrip("/"):
            continue

        # Skip binary/static file extensions
        path_lower = parsed.path.lower()
        if any(path_lower.endswith(ext) for ext in _SKIP_EXTENSIONS):
            continue

        if clean not in seen:
            seen.add(clean)
            results.append(clean)

    logger.info("crawl: base=%s discovered=%d urls", base_url, len(results))
    return results


def _fetch_links(url: str, timeout: int) -> List[str] | None:
    """
    Fetch a URL and return extracted href values.
    Returns None if the request fails.
    """
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "SanjeevaniOps-Crawler/1.0"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "html" not in content_type.lower():
                # Not an HTML page — nothing to extract
                return []
            body = resp.read(512_000).decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        logger.warning("crawl: failed to fetch %s — %s", url, e)
        return None
    except Exception as e:
        logger.warning("crawl: unexpected error fetching %s — %s", url, e)
        return None

    parser = _LinkExtractor()
    parser.feed(body)
    return parser.links
