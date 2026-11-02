"""HTTP clients isolated from process/model proxy environment and scoped to one tool call."""

from contextlib import contextmanager
import requests


@contextmanager
def tool_response(configuration, method, url, **kwargs):
    with requests.Session() as client:
        client.trust_env = False
        proxies = (
            {"http": configuration.proxy_url, "https": configuration.proxy_url}
            if configuration.proxy_mode == "custom"
            else {}
        )
        response = client.request(
            method, url, timeout=configuration.timeout_seconds, proxies=proxies, **kwargs
        )
        try:
            yield response
        finally:
            response.close()
