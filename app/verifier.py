"""Verifier — proves a roadmap step actually worked. No keys needed."""
from __future__ import annotations

import re

import httpx
from pydantic import BaseModel

DNS_DOH = "https://dns.google/resolve"
UA = {"User-Agent": "Mozilla/5.0 (RaahiVerifier)"}


class CheckResult(BaseModel):
    passed: bool
    detail: str


async def _dns(target: str, expect: str = "") -> CheckResult:
    domain = target.strip().rstrip(".").replace("https://", "").replace("http://", "").split("/")[0]
    async with httpx.AsyncClient(timeout=10) as cx:
        for rtype in ("CNAME", "A"):
            r = await cx.get(DNS_DOH, params={"name": domain, "type": rtype})
            data = r.json()
            answers = [a["data"] for a in data.get("Answer", []) if a.get("data")]
            if answers:
                if expect:
                    hit = [a for a in answers if expect.lower() in a.lower()]
                    if hit:
                        return CheckResult(passed=True,
                            detail=f"{domain} {rtype} points to the right place: {hit[0]}")
                    return CheckResult(passed=False,
                        detail=f"{domain} has {rtype} record(s) ({answers[0][:60]}) but none points to "
                               f"the expected destination ({expect}). Fix the record value.")
                return CheckResult(
                    passed=True,
                    detail=f"{domain} has {rtype} record(s): {', '.join(answers[:3])}",
                )
    return CheckResult(
        passed=False,
        detail=(
            f"No CNAME or A record found for {domain} yet. DNS changes can take "
            "up to an hour to appear — check the record was saved, then try again."
        ),
    )


async def _page(target: str) -> CheckResult:
    url = target if target.startswith("http") else "https://" + target
    try:
        async with httpx.AsyncClient(timeout=10, headers=UA, follow_redirects=True) as cx:
            r = await cx.get(url)
    except httpx.HTTPError as e:
        return CheckResult(passed=False, detail=f"{url} did not load: {type(e).__name__}")
    title = ""
    if m := re.search(r"<title[^>]*>(.*?)</title>", r.text, re.S | re.I):
        title = m.group(1).strip()[:80]
    ok = r.status_code < 300 and len(r.text) > 500
    detail = f"{url} → HTTP {r.status_code}" + (f', title "{title}"' if title else "") + (
        "" if ok else " — page loads but looks empty; is it published?"
        if r.status_code < 300 else ""
    )
    return CheckResult(passed=ok, detail=detail)


async def _txt(domain: str, must_contain: str, label: str) -> CheckResult:
    async with httpx.AsyncClient(timeout=10) as cx:
        r = await cx.get(DNS_DOH, params={"name": domain, "type": "TXT"})
    answers = [a["data"].strip('"') for a in r.json().get("Answer", []) if a.get("data")]
    hit = [t for t in answers if must_contain.lower() in t.lower()]
    if hit:
        return CheckResult(passed=True, detail=f"{label} record found on {domain}: {hit[0][:80]}")
    return CheckResult(
        passed=False,
        detail=f"No {label} record on {domain} yet"
        + (f" (found {len(answers)} other TXT records)" if answers else "")
        + " — add the TXT record at your domain provider, then check again.",
    )


KNOWN_TYPES = {"dns", "page", "spf", "dmarc", "manual"}


async def check(type: str, target: str, expect: str = "") -> CheckResult:
    if type not in KNOWN_TYPES:
        return CheckResult(passed=False, detail=f"Unknown check type '{type}' — refusing to pass it.")
    if type == "manual":
        # explicitly NOT independent verification; callers must present it as such
        return CheckResult(passed=True, detail="marked done by you — not independently verified")
    domain = target.strip().replace("https://", "").replace("http://", "").split("/")[0]
    if not target.strip():
        return CheckResult(passed=False, detail="This step has no verification target yet — nothing to check.")
    try:
        from .netguard import BlockedDestination, assert_public_url
        try:
            assert_public_url(target if type == "page" else domain)
        except BlockedDestination as b:
            return CheckResult(passed=False, detail=f"Refused: {b}")
        if type == "dns":
            return await _dns(target, expect)
        if type == "page":
            return await _page(target)
        if type == "spf":
            return await _txt(domain, "v=spf1", "SPF")
        if type == "dmarc":
            return await _txt("_dmarc." + domain, "v=DMARC1", "DMARC")
    except Exception as e:  # a flaky network must give a readable fail, not a 500
        return CheckResult(
            passed=False,
            detail=f"The check itself could not run ({type_name(e)}) — check your connection and try again.",
        )
    return CheckResult(passed=False, detail="unreachable")


def type_name(e: Exception) -> str:
    return type(e).__name__
