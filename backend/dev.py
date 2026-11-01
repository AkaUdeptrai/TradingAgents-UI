"""Supervise local API and Vite; clean up both on interruption or child failure.

Run from anywhere: python -m backend.dev (Windows, macOS, Linux).
"""

import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

from backend.config import TradingAgentsUIConfig

WINDOWS = os.name == "nt"


def _spawn(command: list[str], cwd: Path) -> subprocess.Popen[bytes]:
    # A separate process group lets us stop each child together with its own children.
    if WINDOWS:
        return subprocess.Popen(command, cwd=cwd, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    return subprocess.Popen(command, cwd=cwd, start_new_session=True)


def _stop(process: subprocess.Popen[bytes], force: bool = False) -> None:
    if process.poll() is not None:
        return
    if WINDOWS:
        # Console children ignore a polite taskkill, so end the whole tree at once.
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, check=False
        )
    else:
        os.killpg(process.pid, signal.SIGKILL if force else signal.SIGTERM)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)
    TradingAgentsUIConfig.from_env()
    if not os.getenv("TRADINGAGENTS_UI_PUBLIC_URL"):
        os.environ["TRADINGAGENTS_UI_PUBLIC_URL"] = "http://127.0.0.1:5173"
    npm = shutil.which("npm")
    if npm is None:
        raise SystemExit("Install Node.js >=22.12 (includes npm).")
    processes: list[subprocess.Popen[bytes]] = []

    def stop(signum: int, frame: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        processes.append(_spawn([sys.executable, "-m", "backend"], root))
        processes.append(_spawn([npm, "run", "dev"], root / "frontend"))
        while all(process.poll() is None for process in processes):
            time.sleep(0.3)
        raise SystemExit(
            next(process.returncode for process in processes if process.returncode is not None)
        )
    except KeyboardInterrupt:
        pass
    finally:
        for process in processes:
            _stop(process)
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                _stop(process, force=True)
                process.wait()


if __name__ == "__main__":
    main()
