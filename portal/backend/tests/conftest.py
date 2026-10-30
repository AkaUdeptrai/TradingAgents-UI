"""Portal tests are offline and never read a developer's dotenv files."""

import os
import socket

import pytest

os.environ["PYTHON_DOTENV_DISABLED"] = "1"
for name in list(os.environ):
    if name.startswith(("TRADINGAGENTS_", "PORTAL_")):
        os.environ.pop(name)


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def refuse(*args, **kwargs):
        raise AssertionError("Portal metadata must not access external services")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    from curl_cffi import requests

    monkeypatch.setattr(requests.Session, "request", refuse)
