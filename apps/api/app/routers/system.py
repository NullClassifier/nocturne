"""Runtime version and in-app self-update."""

from __future__ import annotations

import asyncio
import os

from fastapi import APIRouter, Depends, HTTPException
from nocturne_core.capabilities import host_capabilities
from nocturne_core.schemas import Camel
from nocturne_core.security import User, current_user

router = APIRouter(tags=["system"], dependencies=[Depends(current_user)])

class VersionInfo(Camel):
    current: str
    latest: str | None = None
    update_available: bool = False


class UpdateStarted(Camel):
    started: bool
    detail: str


class FeatureAvailability(Camel):
    available: bool
    reason: str


class HostInfo(Camel):
    docker_reachable: bool = False
    os: str = ""
    os_type: str = ""
    kernel: str = ""
    arch: str = ""
    cpus: int = 0
    ram_gb: float = 0.0


class Capabilities(Camel):
    host: HostInfo
    features: dict[str, FeatureAvailability]


def current_version() -> str:
    return os.environ.get("NOCTURNE_VERSION") or "dev"


def _norm(v: str | None) -> tuple[int, ...]:
    if not v:
        return ()
    parts: list[int] = []
    for p in v.strip().lstrip("vV").split("."):
        digits = "".join(ch for ch in p if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts)


def update_available(current: str, latest: str | None) -> bool:
    if not latest or current == "dev":
        return False
    return _norm(latest) > _norm(current)


async def _latest_version() -> str | None:
    # Local-first: no external update feed. Self-hosted builds manage their own
    # version, so the console simply reports the running version as current.
    return None


@router.get("/system/version", response_model=VersionInfo)
async def version() -> VersionInfo:
    current = current_version()
    latest = await _latest_version()
    return VersionInfo(current=current, latest=latest, update_available=update_available(current, latest))


@router.get("/system/capabilities", response_model=Capabilities)
async def capabilities() -> Capabilities:
    data = await host_capabilities()
    return Capabilities(
        host=HostInfo(**data["host"]),
        features={k: FeatureAvailability(**v) for k, v in data["features"].items()},
    )


@router.post("/system/update", response_model=UpdateStarted)
async def start_update(user: User = Depends(current_user)) -> UpdateStarted:
    if user.role != "admin":
        raise HTTPException(403, "admin only")
    repo_dir = os.environ.get("NOCTURNE_COMPOSE_DIR")
    if not repo_dir:
        raise HTTPException(400, "in-app update is not available on this deployment (NOCTURNE_COMPOSE_DIR is not set)")
    image = os.environ.get("NOCTURNE_UPDATER_IMAGE") or "docker:cli"
    cmd = [
        "docker", "run", "-d", "--rm",
        "-v", "/var/run/docker.sock:/var/run/docker.sock",
        "-v", f"{repo_dir}:/repo",
        "-w", "/repo",
        image,
        "sh", "-c",
        "docker compose pull api worker web && docker compose up -d migrate api worker web",
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError((out or b"").decode(errors="replace")[-300:])
    except Exception as exc:
        raise HTTPException(500, f"could not start the updater: {exc}") from None
    return UpdateStarted(started=True, detail="Update started. The stack will pull new images and restart shortly.")
