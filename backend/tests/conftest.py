"""TradingAgents UI tests are offline and never read a developer's dotenv files."""

import ipaddress
import os
import socket

import pytest

os.environ["PYTHON_DOTENV_DISABLED"] = "1"
for name in list(os.environ):
    if name.startswith("TRADINGAGENTS_"):
        os.environ.pop(name)


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def refuse(*args, **kwargs):
        raise AssertionError("TradingAgents UI metadata must not access external services")

    connect = socket.socket.connect
    connect_ex = socket.socket.connect_ex

    def local_only(method):
        def guarded(sock, address):
            if isinstance(address, tuple) and ipaddress.ip_address(address[0]).is_loopback:
                return method(sock, address)
            return refuse()

        return guarded

    monkeypatch.setattr(socket.socket, "connect", local_only(connect))
    monkeypatch.setattr(socket.socket, "connect_ex", local_only(connect_ex))
    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    from curl_cffi import requests

    monkeypatch.setattr(requests.Session, "request", refuse)
