"""WebSocket /ws/incidents/{id}: per-connection deterministic replay plus live operator broadcasts.

Client commands: {"type":"seek","t":..}, {"type":"play","speed":1|4|16}, {"type":"pause"},
{"type":"subscribe"}.
`seek` sends a clock message and every timeline message up to t; `play` advances this connection's cursor
in real time x speed. Stage/gate/stale messages from API calls are forwarded as they happen.

A seek is persisted as the incident's replay position (Incident.replay_cursor_s), so it survives a restart.
When the incident or its database is unavailable the socket closes with 1013 (try again later); clients
reconnect and seek again (apps/web/src/lib/api/ws.ts).
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.exc import SQLAlchemyError

from halt.api.state import service_of
from halt.contracts.ws import ClientMessage, PlayCommand, SeekCommand
from halt.logging import get_logger
from halt.replay import stream
from halt.service import IncidentService, NotFound, Unavailable

router = APIRouter()
_commands: TypeAdapter[Any] = TypeAdapter(ClientMessage)
TICK_S = 0.1
TRY_AGAIN_LATER = 1013


@router.websocket("/ws/incidents/{incident_id}")
async def replay_socket(ws: WebSocket, incident_id: str) -> None:
    try:
        service: IncidentService = service_of(ws.app)
        service.runtime(incident_id)
    except NotFound:
        await ws.close(code=4404)
        return
    except (Unavailable, SQLAlchemyError):
        await ws.close(code=TRY_AGAIN_LATER)
        return
    await ws.accept()

    loop = asyncio.get_running_loop()
    live: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    def listener(message: dict[str, Any]) -> None:
        loop.call_soon_threadsafe(live.put_nowait, message)

    service.listeners.setdefault(incident_id, []).append(listener)
    seq, cursor, playing, speed = 0, 0.0, False, 1
    last = loop.time()

    async def send(t: float, fields: dict[str, Any]) -> None:
        nonlocal seq
        await ws.send_json(stream.build(seq, t, fields))
        seq += 1

    recv_task: asyncio.Task[Any] = asyncio.create_task(ws.receive_json())
    live_task: asyncio.Task[dict[str, Any]] = asyncio.create_task(live.get())
    try:
        while True:
            done, _ = await asyncio.wait(
                {recv_task, live_task},
                timeout=TICK_S if playing else None,
                return_when=asyncio.FIRST_COMPLETED,
            )
            try:
                scenario = service.runtime(incident_id).scenario
            except (Unavailable, SQLAlchemyError):
                await ws.close(code=TRY_AGAIN_LATER)
                break
            if playing:
                now = loop.time()
                end = stream.end_t(scenario)
                target = min(cursor + (now - last) * speed, end)
                last = now
                for item_t, fields in stream.timeline(scenario):
                    if cursor < item_t <= target:
                        await send(item_t, fields)
                cursor = target
                if cursor >= end:
                    playing = False
                    await send(cursor, {"type": "clock", "playing": False, "speed": speed})

            if recv_task in done:
                try:
                    raw = recv_task.result()
                except WebSocketDisconnect:
                    break
                try:
                    command = _commands.validate_python(raw)
                except ValidationError:
                    await ws.close(code=1003)
                    break
                if isinstance(command, SeekCommand):
                    cursor, playing = command.t, False
                    try:
                        service.save_cursor(incident_id, cursor)
                    except (Unavailable, SQLAlchemyError):  # the replay itself does not need the database
                        get_logger().warning("replay_cursor_not_saved", incident_id=incident_id)
                    for message in stream.seek(scenario, cursor, start_seq=seq):
                        await ws.send_json(message)
                        seq += 1
                elif isinstance(command, PlayCommand) and command.type == "play":
                    playing, speed, last = True, command.speed, loop.time()
                    await send(cursor, {"type": "clock", "playing": True, "speed": speed})
                else:  # pause or subscribe
                    playing = False if isinstance(command, PlayCommand) else playing
                    await send(cursor, {"type": "clock", "playing": playing, "speed": speed})
                recv_task = asyncio.create_task(ws.receive_json())

            if live_task in done:
                await send(cursor, live_task.result())
                live_task = asyncio.create_task(live.get())
    finally:
        with contextlib.suppress(ValueError):
            service.listeners[incident_id].remove(listener)
        for task in (recv_task, live_task):
            task.cancel()
