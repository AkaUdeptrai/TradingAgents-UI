"""Supervise local API and Vite; clean up both on interruption or child failure."""

import os
import signal
import subprocess
import time
from pathlib import Path

from tradingagents_ui.runtime.config import TradingAgentsUIConfig


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    os.chdir(root)
    TradingAgentsUIConfig.from_env()
    if not os.getenv("TRADINGAGENTS_UI_PUBLIC_URL"):
        os.environ["TRADINGAGENTS_UI_PUBLIC_URL"] = "http://127.0.0.1:5173"
    processes: list[subprocess.Popen] = []

    def stop(signum: int, frame: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        processes.append(
            subprocess.Popen(
                [str(root / ".venv/bin/python"), "-m", "tradingagents_ui.runtime"], start_new_session=True
            )
        )
        processes.append(
            subprocess.Popen(
                ["npm", "run", "dev"], cwd=root / "tradingagents_ui/web", start_new_session=True
            )
        )
        while all(process.poll() is None for process in processes):
            time.sleep(0.3)
        raise SystemExit(
            next(process.returncode for process in processes if process.returncode is not None)
        )
    except KeyboardInterrupt:
        pass
    finally:
        for process in processes:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()


if __name__ == "__main__":
    main()
