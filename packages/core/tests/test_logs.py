import logging

from nocturne_core.logs import configure, get_logger


def test_get_logger_is_nocturne_child():
    assert get_logger("engine.test").name == "nocturne.engine.test"


def test_configure_is_idempotent():
    configure()
    n = len(logging.getLogger("nocturne").handlers)
    configure()
    assert len(logging.getLogger("nocturne").handlers) == n
