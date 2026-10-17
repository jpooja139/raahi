"""SSRF guard — outbound fetches may only reach public internet hosts."""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class BlockedDestination(Exception):
    pass


def assert_public_url(url: str) -> None:
    host = urlparse(url if "://" in url else "https://" + url).hostname or ""
    if not host:
        raise BlockedDestination("no host")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return  # unresolvable → the fetch itself will fail loudly
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            raise BlockedDestination(f"{host} resolves to a non-public address")


async def safe_request(cx, method: str, url: str, max_redirects: int = 5):
    """Follow redirects manually, re-validating every hop against private nets."""
    cur = url
    for _ in range(max_redirects + 1):
        assert_public_url(cur)
        r = await cx.request(method, cur, follow_redirects=False)
        if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
            from urllib.parse import urljoin
            cur = urljoin(cur, r.headers["location"])
            method = "GET" if r.status_code == 303 else method
            continue
        return r
    raise BlockedDestination("too many redirects")
