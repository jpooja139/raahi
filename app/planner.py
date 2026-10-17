"""Planner — turns a creator's goal into a decision card + verified roadmap."""
from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel

from . import gemini
from .catalogue import TOOLS


class Check(BaseModel):
    type: Literal["dns", "page", "manual", "spf", "dmarc"]
    target: str
    expect: str = ""  # optional expected destination/content for dns checks


class Step(BaseModel):
    n: int
    title: str
    why: str
    minutes: int
    concept: str
    check: Check


class Rejected(BaseModel):
    name: str
    reason: str


class Decision(BaseModel):
    recommendation: str
    why: str
    cost: str
    time_minutes: int
    rejected: list[Rejected]
    clarifying_questions: list[str]
    roadmap: list[Step]


PROMPT = """You are Raahi, an AI engineer who guides creators (YouTubers,
influencers) who are experts at content but not at tech.

A creator's goal and their answers so far are below. Decide the best way to
achieve the goal and produce a roadmap.

HARD RULES:
- Recommend tools ONLY from this catalogue (verbatim names). Never invent a
  tool, a price, or a feature not listed:
{catalogue}
- If the goal or answers leave a decision-changing fact unknown (budget,
  which accounts they already have, audience country, time for upkeep),
  return clarifying_questions (1-3, plain language) and an EMPTY roadmap.
- NEVER invent placeholder values for check targets (no "yourdomain.com",
  "example.com", "your-site"). If a dns/page check would need the creator's
  real domain or URL and it is not in the goal/answers, ASK for it via
  clarifying_questions instead of planning with a fake target.
- Otherwise clarifying_questions is empty and roadmap has 3-6 steps.
- Each step: title (imperative, one action), why (one sentence), minutes
  (realistic), concept (ONE sentence teaching the idea behind the step —
  plain words, no jargon), and a check:
    - type "dns" with target = the bare domain, when the step connects a domain
    - type "page" with target = the URL that should load, when the step
      publishes something reachable
    - type "spf" / "dmarc" with target = the sending domain, when the step sets
      up email authentication records
    - type "manual" with target "" otherwise
- recommendation = the main tool's name. why = 2-3 sentences comparing
  against the closest alternatives. cost = plain text like "Free (domain
  ~Rs 800/year separate)". rejected = the 2-3 closest alternatives you did
  NOT pick, each with a one-line reason.
- Answer in the language the goal is written in (Hindi, English, or mixed).

GOAL: {goal}
ANSWERS SO FAR: {answers}
CONCEPTS THIS CREATOR ALREADY LEARNED (skip re-teaching these; keep their
steps but set concept to "" for ideas they already know): {skills}
"""


def decide(goal: str, answers: dict, known_skills: list[str] | None = None) -> Decision:
    prompt = PROMPT.format(
        catalogue=json.dumps(TOOLS, ensure_ascii=False, indent=1),
        goal=goal,
        answers=json.dumps(answers, ensure_ascii=False) or "{}",
        skills=json.dumps(known_skills or [], ensure_ascii=False),
    )
    return gemini.generate_json(prompt, Decision)
