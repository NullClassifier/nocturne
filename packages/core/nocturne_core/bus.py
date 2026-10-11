"""Redis pub/sub bus for live events. If Redis is unreachable at connect(), falls
back to an in-process pub/sub with an identical public API (single-node dev, tests)."""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from typing import Any

import redis.asyncio as redis

from .config import settings

# Shell output channels ("shell:<id>") get a replayable transcript so the
# Terminal panel can show the last known state when nothing is streaming.
_SHELL_PREFIX = "shell:"
_SHELL_BUF_MAX = 4000   # chunks retained per shell (rolling)
_SHELL_BUF_TTL = 86400  # seconds; drop stale transcripts after a day


def events_channel(run_id: str) -> str:
    return f"events:{run_id}"


def chat_channel(run_id: str) -> str:
    return f"chat:{run_id}"


def shell_channel(shell_id: str) -> str:
    return f"shell:{shell_id}"


def shell_input_channel(shell_id: str) -> str:
    """Operator keystrokes headed *into* a shell (e.g. a caught reverse shell)."""
    return f"shellin:{shell_id}"


def control_channel(run_id: str) -> str:
    """Run control commands (pause/resume/stop) from the API to the worker."""
    return f"control:{run_id}"


def notifications_channel() -> str:
    return "notifications"


def browser_channel(session_id: str) -> str:
    """Browser control-owner handoff (operator take/release) from the API to the worker."""
    return f"browser:{session_id}"


class _MemoryBackend:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue[str]]] = defaultdict(set)
        self._bufs: dict[str, deque[str]] = {}

    def buffer(self, channel: str, message: str) -> None:
        buf = self._bufs.get(channel)
        if buf is None:
            buf = self._bufs[channel] = deque(maxlen=_SHELL_BUF_MAX)
        buf.append(message)

    def history(self, channel: str) -> str:
        return "".join(self._bufs.get(channel, ()))

    async def publish(self, channel: str, message: str) -> None:
        for q in list(self._subs.get(channel, ())):
            q.put_nowait(message)

    async def subscribe(self, channel: str) -> AsyncIterator[str]:
        q: asyncio.Queue[str] = asyncio.Queue()
        self._subs[channel].add(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subs[channel].discard(q)


class Bus:
    def __init__(self, url: str) -> None:
        self._url = url
        self._redis: redis.Redis | None = None
        self._memory: _MemoryBackend | None = None

    async def connect(self) -> None:
        try:
            client = redis.from_url(self._url, decode_responses=True)
            await client.ping()
            self._redis = client
        except Exception:
            self._memory = _MemoryBackend()

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()

    @property
    def transport(self) -> str:
        return "redis" if self._redis is not None else "memory"

    async def ping(self) -> bool:
        if self._redis is not None:
            try:
                return bool(await self._redis.ping())
            except Exception:
                return False
        return self._memory is not None

    async def publish(self, channel: str, message: str) -> None:
        if self._redis is not None:
            await self._redis.publish(channel, message)
            if channel.startswith(_SHELL_PREFIX):
                await self._record(channel, message)
        elif self._memory is not None:
            await self._memory.publish(channel, message)
            if channel.startswith(_SHELL_PREFIX):
                self._memory.buffer(channel, message)
        else:
            raise RuntimeError("bus not connected")

    async def _record(self, channel: str, message: str) -> None:
        """Append to a shell channel's rolling transcript (Redis list, capped + TTL)."""
        key = f"buf:{channel}"
        try:
            pipe = self._redis.pipeline()
            pipe.rpush(key, message)
            pipe.ltrim(key, -_SHELL_BUF_MAX, -1)
            pipe.expire(key, _SHELL_BUF_TTL)
            await pipe.execute()
        except Exception:
            pass  # buffering is best-effort; never break live publish

    async def history(self, channel: str) -> str:
        """The last known transcript for a shell channel, '' if none."""
        if self._redis is not None:
            try:
                parts = await self._redis.lrange(f"buf:{channel}", 0, -1)
                return "".join(parts)
            except Exception:
                return ""
        if self._memory is not None:
            return self._memory.history(channel)
        return ""

    async def publish_json(self, channel: str, obj: Any) -> None:
        await self.publish(channel, json.dumps(obj))

    async def subscribe(self, channel: str) -> AsyncIterator[str]:
        if self._redis is not None:
            pubsub = self._redis.pubsub()
            await pubsub.subscribe(channel)
            try:
                async for msg in pubsub.listen():
                    if msg is not None and msg.get("type") == "message":
                        yield msg["data"]
            finally:
                try:
                    await pubsub.unsubscribe(channel)
                finally:
                    await pubsub.aclose()
        elif self._memory is not None:
            async for msg in self._memory.subscribe(channel):
                yield msg
        else:
            raise RuntimeError("bus not connected")


bus = Bus(settings.redis_url)
