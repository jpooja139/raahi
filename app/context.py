"""Creator Context Engine — the personalised environment.

One document per creator (keyed by channel handle). Holds what Raahi has
learned about them: snapshots of their channel's health, decisions made and
their outcomes, skills already taught (so Raahi never re-explains DNS).
Context compounds — this document IS the product's memory.
"""
from __future__ import annotations

import time

from . import store

SCHEMA = 1
MAX_SNAPSHOTS = 30


def _key(handle: str) -> str:
    return "creator_" + handle.lstrip("@").lower()


def get_profile(handle: str) -> dict:
    doc = store.get(_key(handle))
    if not doc:
        doc = {
            "schema": SCHEMA,
            "handle": handle.lstrip("@"),
            "created_at": time.time(),
            "domain": "",
            "language": "",
            "skills_learned": [],   # concepts the creator has completed a step for
            "decisions": [],        # {ts, recommendation, goal, outcome}
            "snapshots": [],        # pulse snapshots, newest last
        }
    return doc


def save_profile(doc: dict) -> bool:
    return store.put(_key(doc["handle"]), doc)


def add_snapshot(handle: str, snapshot: dict, domain: str = "") -> dict:
    doc = get_profile(handle)
    if domain:
        doc["domain"] = domain
    doc["snapshots"] = (doc["snapshots"] + [snapshot])[-MAX_SNAPSHOTS:]
    save_profile(doc)
    return doc


def record_decision(handle: str, goal: str, recommendation: str) -> None:
    doc = get_profile(handle)
    doc["decisions"].append({"ts": time.time(), "goal": goal, "recommendation": recommendation})
    doc["decisions"] = doc["decisions"][-50:]
    save_profile(doc)


def learn_skill(handle: str, concept: str) -> None:
    if not concept:
        return
    doc = get_profile(handle)
    if concept not in doc["skills_learned"]:
        doc["skills_learned"].append(concept)
        save_profile(doc)
