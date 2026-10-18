"""Tutorial Rescue: the parts that decide what may be shown as fact.
No network — grounding metadata is faked with the same shape the SDK returns."""
from datetime import datetime, timezone
from types import SimpleNamespace as NS

import pytest

from app import rescue
from app.rescue import ExtractedStep, Source


def _gm(text: str, spans: list[tuple[str, list[int]]], chunks: list[tuple[str, str]]):
    """Fake grounding metadata: each span is located in `text` and converted to
    UTF-8 byte offsets, exactly as the API reports them."""
    b = text.encode("utf-8")
    sups = []
    for needle, idx in spans:
        s = b.index(needle.encode("utf-8"))
        sups.append(NS(segment=NS(start_index=s, end_index=s + len(needle.encode("utf-8")), text=needle),
                       grounding_chunk_indices=idx))
    return NS(
        grounding_chunks=[NS(web=NS(uri=u, title=d, domain=d)) for d, u in chunks],
        grounding_supports=sups,
    )


def test_video_id_forms():
    for url in ("https://www.youtube.com/watch?v=RPtyPYJHCEY",
                "https://youtu.be/RPtyPYJHCEY?t=30",
                "https://www.youtube.com/watch?feature=share&v=RPtyPYJHCEY",
                "https://www.youtube.com/shorts/RPtyPYJHCEY",
                "https://www.youtube.com/live/RPtyPYJHCEY"):
        assert rescue.video_id(url) == "RPtyPYJHCEY"
    with pytest.raises(ValueError):
        rescue.video_id("https://example.com/watch?v=nope")


@pytest.mark.parametrize("t,sec", [("2:14", 134), ("02:14", 134), ("1:02:14", 3734),
                                   ("0:00", 0), ("12:75", None), ("abc", None), ("", None)])
def test_parse_ts(t, sec):
    assert rescue.parse_ts(t) == sec


def test_fmt_ts_roundtrip():
    assert rescue.fmt_ts(134) == "2:14"
    assert rescue.fmt_ts(3734) == "1:02:14"


def test_iso_duration():
    assert rescue.iso_duration("PT12M3S") == 723
    assert rescue.iso_duration("PT1H") == 3600
    assert rescue.iso_duration("") is None


TEXT = (
    "**STEP 1: changed**\nTODAY: Google Domains has shut down; buy the domain at Squarespace or another registrar.\n\n"
    "STEP 2: current\nTODAY: Settings > Custom domains > Start setup is still there.\n\n"
    "STEP 3 – Unverifiable\nTODAY: Look for the CNAME step in your registrar.\n"
)


def test_parse_blocks_tolerates_markdown_and_dashes():
    blocks = rescue.parse_blocks(TEXT)
    assert sorted(blocks) == [1, 2, 3]
    assert blocks[1]["status"] == "changed"
    assert blocks[1]["today"].startswith("Google Domains has shut down")
    assert blocks[3]["status"] == "unverifiable"
    assert blocks[1]["b1"] == blocks[2]["b0"]  # contiguous, no gaps


def test_parse_blocks_first_verdict_wins():
    blocks = rescue.parse_blocks("STEP 1: current\nTODAY: a\n\nSTEP 1: changed\nTODAY: b\n")
    assert blocks[1]["status"] == "current" and blocks[1]["today"] == "a"


def test_sources_use_byte_offsets_with_hindi():
    # Hindi before the second block shifts byte offsets far from char offsets;
    # a char-offset implementation would attach step 2's source to step 1.
    text = ("STEP 1: changed\nTODAY: Google Domains अब बंद हो चुका है, Squarespace से डोमेन लें।\n\n"
            "STEP 2: current\nTODAY: Settings > Custom domains अभी भी वहीं है।\n")
    gm = _gm(text,
             spans=[("Google Domains अब बंद हो चुका है", [0]), ("Settings > Custom domains", [1])],
             chunks=[("support.google.com", "https://r/1"), ("support.squarespace.com", "https://r/2")])
    blocks = rescue.parse_blocks(text)
    src = rescue.sources_by_step(blocks, gm)
    assert [s.domain for s in src[1]] == ["support.google.com"]
    assert [s.domain for s in src[2]] == ["support.squarespace.com"]


def test_sources_dedupe_and_cap():
    gm = _gm(TEXT, spans=[("Google Domains has shut down", [0, 1, 0, 2, 3])],
             chunks=[(f"d{i}.com", f"https://r/{i}") for i in range(4)])
    src = rescue.sources_by_step(rescue.parse_blocks(TEXT), gm)
    assert [s.uri for s in src[1]] == ["https://r/0", "https://r/1", "https://r/2"]
    assert src[2] == []


def _steps():
    return [ExtractedStep(n=1, t="0:48", instruction="Buy a domain in Google Domains"),
            ExtractedStep(n=2, t="3:10", instruction="Click Settings > Custom domains"),
            ExtractedStep(n=3, t="99:00", instruction="Add a CNAME record"),
            ExtractedStep(n=4, t="5:00", instruction="Publish")]


SRC = Source(title="support.google.com", domain="support.google.com", uri="https://r/1")


def test_validate_downgrades_unsourced_verdicts_and_bad_timestamps():
    blocks = rescue.parse_blocks(TEXT)
    out = rescue.validate(_steps(), blocks, {1: [SRC], 2: [], 3: []}, duration_s=600)
    by = {s.n: s for s in out}
    assert by[1].status == "changed" and not by[1].downgraded and by[1].t == "0:48"
    assert by[2].status == "unverifiable" and by[2].downgraded        # "current" with no source
    assert by[3].status == "unverifiable" and not by[3].downgraded    # model itself said unverifiable
    assert by[3].t == "" and by[3].seconds is None                    # 99:00 > 10-minute video
    assert by[4].status == "unverifiable" and by[4].today == rescue.NOT_CHECKED["en"]  # no block at all


def test_update_card_only_uses_sourced_verdicts():
    blocks = rescue.parse_blocks(TEXT)
    steps = rescue.validate(_steps(), blocks, {1: [SRC], 2: [SRC]}, duration_s=600)
    card = rescue.update_card(steps, "Google Sites", datetime(2026, 10, 18, tzinfo=timezone.utc))
    assert card.startswith("📌 Update (Oct 2026): 1 step in this video changed")
    assert "Step 1 (0:48): Google Domains has shut down" in card
    assert "(source: support.google.com)" in card
    assert "Step 2 still works as shown." in card
    assert "Couldn't confirm steps 3–4 either way." in card


def test_update_card_empty_without_evidence():
    steps = rescue.validate(_steps(), {}, {}, duration_s=600)
    assert rescue.update_card(steps, "Google Sites", datetime(2026, 10, 18)) == ""


def test_update_card_hindi_month():
    blocks = rescue.parse_blocks(TEXT)
    steps = rescue.validate(_steps(), blocks, {1: [SRC]}, duration_s=600)
    card = rescue.update_card(steps, "Google Sites", datetime(2026, 10, 18), lang="hi")
    assert card.startswith("📌 अपडेट (अक्टूबर 2026)")
    assert "स्रोत: support.google.com" in card


def test_ranges():
    assert rescue._ranges([1, 2, 3, 5, 7, 8]) == "1–3, 5, 7–8"
    assert rescue._ranges([4]) == "4"


@pytest.mark.parametrize("d,root", [("https://support.google.com/sites/answer/1", "google.com"),
                                    ("www.OBSProject.com", "obsproject.com"),
                                    ("help.example.co.uk", "example.co.uk"),
                                    ("google.com", "google.com")])
def test_root_domain(d, root):
    assert rescue.root_domain(d) == root


def test_mark_official_flags_and_orders():
    srcs = {1: [Source(title="wikihow.com", domain="wikihow.com", uri="u1"),
                Source(title="support.google.com", domain="support.google.com", uri="u2")]}
    out = rescue.mark_official(srcs, ["google.com"])
    assert [s.domain for s in out[1]] == ["support.google.com", "wikihow.com"]
    assert out[1][0].official and not out[1][1].official
    # a lookalike must not pass the string match
    look = rescue.mark_official({1: [Source(title="x", domain="google.com.evil.io", uri="u3")]}, ["google.com"])
    assert not look[1][0].official


def test_counts():
    blocks = rescue.parse_blocks(TEXT)
    c = rescue.counts(rescue.validate(_steps(), blocks, {1: [SRC]}, duration_s=600))
    assert c == {"current": 0, "changed": 1, "unverifiable": 3, "downgraded": 1,
                 "with_sources": 1, "with_official_source": 0, "with_timestamp": 3}
