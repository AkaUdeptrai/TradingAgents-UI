import uvicorn

from tradingagents_ui.runtime.app import create_app
from tradingagents_ui.runtime.config import TradingAgentsUIConfig


def main() -> None:
    config = TradingAgentsUIConfig.from_env()
    # OAuth callback query strings contain temporary codes. Do not write access logs.
    uvicorn.run(create_app(config), host=config.host, port=config.port, access_log=False)


if __name__ == "__main__":
    main()
