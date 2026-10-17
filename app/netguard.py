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
