import uvicorn

from portal.backend.app import create_app
from portal.backend.config import PortalConfig


def main() -> None:
    config = PortalConfig.from_env()
    # OAuth callback query strings contain temporary codes. Do not write access logs.
    uvicorn.run(create_app(config), host=config.host, port=config.port, access_log=False)


if __name__ == "__main__":
    main()
