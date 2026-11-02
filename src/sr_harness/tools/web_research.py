# Copyright (c) 2026-present, Yumeow. Licensed under the MIT License.
"""Bounded public-web search."""

from __future__ import annotations

from html.parser import HTMLParser
from html import unescape
import ipaddress
import socket
from typing import Any, Dict
from urllib.parse import parse_qs, unquote, urlparse

from ..core.tool_config import NetworkToolConfiguration
from ..runtime.tool_http import tool_response

from .base_tool import BaseTool, ToolMetadata


class _DuckDuckGoParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.results = []
        self._field = None
        self._parts = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = set(attributes.get("class", "").split())
        if tag == "a" and "result__a" in classes:
            href = attributes.get("href", "")
            parsed = urlparse(href)
            href = unquote(parse_qs(parsed.query).get("uddg", [href])[0])
            self.results.append({"title": "", "url": href, "snippet": ""})
            self._field, self._parts = "title", []
        elif self.results and ("result__snippet" in classes):
            self._field, self._parts = "snippet", []

    def handle_data(self, data):
        if self._field:
            self._parts.append(data)

    def handle_endtag(self, tag):
        if self._field and tag in {"a", "div"}:
            self.results[-1][self._field] = unescape(" ".join("".join(self._parts).split()))
            self._field, self._parts = None, []


@BaseTool.register("web_search")
class WebSearchTool(BaseTool):
    """Tool for searching the public web for scientific papers, benchmarks, and documentation."""

    metadata = ToolMetadata(name="web_search")
    configuration_model = NetworkToolConfiguration
    configuration_defaults = {"timeout_seconds": 15, "proxy_mode": "direct", "proxy_url": None}

    def execute(self, query: str, max_results: int = 5) -> Dict[str, Any]:
        """Search the public web for scientific literature, documentation, and domain context.

        Args:
            query: Specific search query string.
            max_results: Maximum number of search results to return (1-10, default 5).

        Returns:
            Dict[str, Any]: Search query, provider name, and list of ``{"title", "url", "snippet"}`` results.
        """
        if not query.strip():
            raise ValueError("query must not be empty")
        max_results = max(1, min(int(max_results), 10))
        callback = getattr(self.context.args, "web_search_callback", None)
        if callback is not None:
            results = callback(query, max_results)
            return {"query": query, "results": list(results)[:max_results], "provider": "callback"}
        configuration = self.get_runtime_configuration()
        with tool_response(
            configuration,
            "POST",
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            allow_redirects=False,
            headers={"User-Agent": "SRAgent/1.0 (research assistant)"},
        ) as response:
            response.raise_for_status()
            parser = _DuckDuckGoParser()
            parser.feed(response.text)
            return {
                "query": query,
                "results": parser.results[:max_results],
                "provider": "duckduckgo-html",
            }


class _TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "svg", "noscript"}:
            self.ignored += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style", "svg", "noscript"} and self.ignored:
            self.ignored -= 1

    def handle_data(self, data):
        if not self.ignored and data.strip():
            self.parts.append(data.strip())


@BaseTool.register("web_fetch")
class WebFetchTool(BaseTool):
    """Tool for fetching readable plain text from a public HTTP(S) webpage."""

    metadata = ToolMetadata(name="web_fetch")
    configuration_model = NetworkToolConfiguration
    configuration_defaults = {"timeout_seconds": 20, "proxy_mode": "direct", "proxy_url": None}

    def execute(self, url: str, max_characters: int = 30000) -> Dict[str, Any]:
        """Fetch and extract readable text from a public HTTP or HTTPS webpage URL.

        Rejects non-public IP addresses, credentials in URLs, and HTTP redirects. If a site blocks
        automated access (HTTP 401/403/429), returns ``blocked=True`` so you can search for an
        alternative source instead of retrying.

        Args:
            url: Absolute public ``http://`` or ``https://`` URL to fetch.
            max_characters: Maximum number of extracted text characters to return (1000-50000, default 30000).

        Returns:
            Dict[str, Any]: URL, extracted text, truncation flag, and block status if access was denied.
        """
        parsed = urlparse(url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise ValueError("url must be an absolute HTTP or HTTPS URL")
        try:
            literal_address = ipaddress.ip_address(parsed.hostname)
        except ValueError:
            literal_address = None
        if literal_address is not None and not literal_address.is_global:
            raise ValueError("url must resolve only to public network addresses")
        addresses = {
            item[4][0]
            for item in socket.getaddrinfo(
                parsed.hostname,
                parsed.port or (443 if parsed.scheme == "https" else 80),
                type=socket.SOCK_STREAM,
            )
        }
        public_addresses = {
            address for address in addresses if ipaddress.ip_address(address).is_global
        }
        configuration = self.get_runtime_configuration()
        # An explicit HTTP(S) proxy resolves the target hostname itself. Retain the
        # original mixed-DNS compatibility in that mode; direct connections must
        # reject every non-public answer. Neither mode permits all-private results.
        if not public_addresses or (
            public_addresses != addresses and configuration.proxy_mode == "direct"
        ):
            raise ValueError("url must resolve only to public network addresses")
        limit = max(1000, min(int(max_characters), 50000))
        with tool_response(
            configuration,
            "GET",
            url,
            headers={"User-Agent": "SRHarness/1.0"},
            allow_redirects=False,
            stream=True,
        ) as response:
            if response.is_redirect:
                raise ValueError(
                    "redirects are not followed; fetch the public destination URL directly"
                )
            if response.status_code in {401, 403, 429}:
                status_code = response.status_code
                return {
                    "url": url,
                    "text": "",
                    "truncated": False,
                    "blocked": True,
                    "status_code": status_code,
                    "message": (
                        "The site blocked automated access. Do not retry this URL repeatedly; "
                        "use web_search to find an accessible authoritative source for the same data."
                    ),
                }
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if (
                "html" not in content_type
                and "text" not in content_type
                and "json" not in content_type
            ):
                raise ValueError(f"unsupported content type: {content_type}")
            body = bytearray()
            for chunk in response.iter_content(64 * 1024):
                body.extend(chunk)
                if len(body) >= 1_000_000:
                    break
            parser = _TextParser()
            parser.feed(
                bytes(body[:1_000_000]).decode(response.encoding or "utf-8", errors="replace")
            )
            text = "\n".join(parser.parts)
            return {"url": url, "text": text[:limit], "truncated": len(text) > limit}


"""
Real invocation and output captured from DuckDuckGo HTML search:

>>> WebSearchTool().execute("EIC symbolic regression paper", max_results=2)
{'query': 'EIC symbolic regression paper', 'results': [
 {'title': '[2509.21780v1] Beyond Formula Complexity: Effective Information ...',
  'url': 'https://arxiv.org/abs/2509.21780v1',
  'snippet': 'Combining EIC with various search-based symbolic regression ...'},
 {'title': 'Beyond Accuracy and Complexity: The Effective Information Criterion for ...',
  'url': 'https://arxiv.org/html/2509.21780',
  'snippet': 'This paper presents the Effective Information Criterion (EIC) ...'}],
 'provider': 'duckduckgo-html'}
"""
