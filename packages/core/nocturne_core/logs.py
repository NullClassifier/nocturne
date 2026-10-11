"""Application logging. `configure()` is called once at API/worker startup;
`get_logger(name)` returns a child of the `nocturne` logger."""

from __future__ import annotations

import logging
import sys

_configured = False


def configure(level: str = "INFO") -> None:
    global _configured
    if _configured:
        return
    logger = logging.getLogger("nocturne")
    logger.setLevel(level)
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s %(message)s"))
    logger.addHandler(handler)
    logger.propagate = False
    _configured = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger("nocturne." + name)
