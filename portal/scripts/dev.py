"""Supervise local API and Vite; clean up both on interruption or child failure."""

import os
import signal
import subprocess
import time
from pathlib import Path

from portal.backend.config import PortalConfig


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    os.chdir(root)
    PortalConfig.from_env()
    if not os.getenv("PORTAL_PUBLIC_URL"):
        os.environ["PORTAL_PUBLIC_URL"] = "http://127.0.0.1:5173"
    processes: list[subprocess.Popen] = []

    def stop(signum: int, frame: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        processes.append(
            subprocess.Popen(
                [str(root / ".venv/bin/python"), "-m", "portal.backend"], start_new_session=True
            )
        )
        processes.append(
            subprocess.Popen(
                ["npm", "run", "dev"], cwd=root / "portal/frontend", start_new_session=True
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
