import uvicorn

from backend.app import create_app
from backend.config import TradingAgentsUIConfig


def main() -> None:
    config = TradingAgentsUIConfig.from_env()
    # OAuth callback query strings contain temporary codes. Do not write access logs.
    uvicorn.run(create_app(config), host=config.host, port=config.port, access_log=False)


if __name__ == "__main__":
    main()
