"""Voice — WebSocket bridge: browser mic ⇄ FastAPI ⇄ Gemini Live.

Browser → server: {"type":"state", decision, current_step} (anytime),
                  {"type":"audio", "data": b64 PCM16 @16 kHz}
Server → browser: {"type":"audio", "data": b64 PCM16 @24 kHz},
                  {"type":"text", "text": transcript chunk},
                  {"type":"toolcall", "name": …}, {"type":"interrupted"},
                  {"type":"reconnect"}, {"type":"error", "detail": …}
"""
from __future__ import annotations

import asyncio
import base64
import json

from fastapi import WebSocket, WebSocketDisconnect

from . import config, verifier
from .gemini import GeminiError, client

SYSTEM = """You are Raahi (राही), a voice guide for creators who are experts
at content but not tech. You speak in short, warm, spoken-style sentences —
2-3 at a time, never a lecture. Hints before answers; give exact values only
after the user has tried. One plain-words concept per step, one sentence.
Never ask for passwords or OTPs.
You have tools: get_current_step() tells you where the user is in their
roadmap; run_check() verifies the current step really worked — call it when
the user says a step is done, then speak the result in plain words.
Reply in the user's language — Hindi, English, or mixed Hinglish."""

TOOLS = [
    {
        "function_declarations": [
            {
                "name": "get_current_step",
                "description": "Get the user's current roadmap step and plan summary.",
            },
            {
                "name": "run_check",
                "description": "Verify the current step actually worked (DNS or page check).",
            },
        ]
    }
]


async def _tool_result(name: str, state: dict) -> dict:
    decision = state.get("decision") or {}
    steps = decision.get("roadmap", [])
    cur = next((s for s in steps if s["n"] == state.get("current_step", 1)), None)
    if name == "get_current_step":
        return {
            "plan": decision.get("recommendation", "no plan yet"),
            "step": cur or "no roadmap yet — user is exploring",
            "total_steps": len(steps),
        }
    if name == "run_check":
        if not cur:
            return {"passed": False, "detail": "no active step to check"}
        if cur["check"]["type"] == "manual":
            return {"passed": True, "detail": "manual step — trust the user's word"}
        try:
            res = await verifier.check(cur["check"]["type"], cur["check"]["target"])
        except Exception as e:  # network hiccup must not kill the voice session
            return {"passed": False, "detail": f"check could not run ({type(e).__name__}) — try again"}
        return res.model_dump()
    return {"error": f"unknown tool {name}"}


async def live_session(ws: WebSocket):
    await ws.accept()
    lang = ws.query_params.get("lang", "en-IN")
    state: dict = {"decision": None, "current_step": 1}

    try:
        c = client()
    except GeminiError as e:
        await ws.send_text(json.dumps({"type": "error", "detail": str(e)}))
        await ws.close()
        return

    from google.genai import types

    cfg = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=SYSTEM,
        speech_config=types.SpeechConfig(language_code=lang),
        output_audio_transcription={},
        tools=TOOLS,
    )

    try:
        async with c.aio.live.connect(model=config.MODEL_LIVE, config=cfg) as session:

            async def browser_to_gemini():
                while True:
                    raw = await ws.receive_text()
                    msg = json.loads(raw)
                    if msg["type"] == "state":
                        state["decision"] = msg.get("decision")
                        state["current_step"] = msg.get("current_step", 1)
                    elif msg["type"] == "audio":
                        await session.send_realtime_input(
                            audio=types.Blob(
                                data=base64.b64decode(msg["data"]),
                                mime_type="audio/pcm;rate=16000",
                            )
                        )

            async def gemini_to_browser():
                # session.receive() completes after each model turn — loop it;
                # reconnect only on GoAway or a real connection close.
                while True:
                    going_away = False
                    async for msg in session.receive():
                        if msg.go_away is not None:
                            going_away = True
                        sc = msg.server_content
                        if msg.tool_call:
                            responses = []
                            for fc in msg.tool_call.function_calls:
                                await ws.send_text(
                                    json.dumps({"type": "toolcall", "name": fc.name})
                                )
                                result = await _tool_result(fc.name, state)
                                if fc.name == "run_check" and result.get("passed"):
                                    cur = state.get("current_step", 1)
                                    total = len(
                                        (state.get("decision") or {}).get("roadmap", [])
                                    )
                                    state["current_step"] = min(cur + 1, max(total, 1))
                                    await ws.send_text(
                                        json.dumps(
                                            {
                                                "type": "check",
                                                "n": cur,
                                                "passed": True,
                                                "detail": result.get("detail", ""),
                                            }
                                        )
                                    )
                                elif fc.name == "run_check":
                                    await ws.send_text(
                                        json.dumps(
                                            {
                                                "type": "check",
                                                "n": state.get("current_step", 1),
                                                "passed": False,
                                                "detail": result.get("detail", ""),
                                            }
                                        )
                                    )
                                responses.append(
                                    types.FunctionResponse(
                                        id=fc.id, name=fc.name, response=result
                                    )
                                )
                            await session.send_tool_response(
                                function_responses=responses
                            )
                            continue
                        if sc is None:
                            continue
                        if sc.interrupted:
                            await ws.send_text(json.dumps({"type": "interrupted"}))
                        if sc.output_transcription and sc.output_transcription.text:
                            await ws.send_text(
                                json.dumps(
                                    {"type": "text", "text": sc.output_transcription.text}
                                )
                            )
                        if sc.model_turn:
                            for part in sc.model_turn.parts or []:
                                if part.inline_data and part.inline_data.data:
                                    await ws.send_text(
                                        json.dumps(
                                            {
                                                "type": "audio",
                                                "data": base64.b64encode(
                                                    part.inline_data.data
                                                ).decode(),
                                            }
                                        )
                                    )
                    if going_away:
                        break
                # session really ending (GoAway) → tell the client to reopen
                await ws.send_text(json.dumps({"type": "reconnect"}))

            done, pending = await asyncio.wait(
                [
                    asyncio.create_task(browser_to_gemini()),
                    asyncio.create_task(gemini_to_browser()),
                ],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for t in pending:
                t.cancel()
    except WebSocketDisconnect:
        pass
    except Exception as e:  # session-level failure → tell the client to retry
        try:
            await ws.send_text(json.dumps({"type": "reconnect", "detail": str(e)[:200]}))
        except Exception:
            pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass
