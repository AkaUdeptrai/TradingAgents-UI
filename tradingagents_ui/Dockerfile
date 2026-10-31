FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY tradingagents_ui/web/package*.json ./
RUN npm ci
COPY tradingagents_ui/web/ ./
COPY tradingagents_ui/schema/ /schema/
ARG TRADINGAGENTS_UI_API_URL=/api
ENV TRADINGAGENTS_UI_API_URL=${TRADINGAGENTS_UI_API_URL}
RUN npm run build

FROM python:3.13-slim AS runtime
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY pyproject.toml README.md LICENSE ./
COPY tradingagents/ tradingagents/
COPY cli/ cli/
COPY tradingagents_ui/__init__.py tradingagents_ui/__init__.py
COPY tradingagents_ui/runtime/ tradingagents_ui/runtime/
RUN pip install --no-cache-dir '.[ui]'

FROM python:3.13-slim
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    TRADINGAGENTS_UI_HOST=0.0.0.0 TRADINGAGENTS_UI_PORT=8000 \
    TRADINGAGENTS_UI_STATIC_DIR=/app/tradingagents_ui/web/dist
RUN useradd --create-home appuser \
 && install -d -m 0700 -o appuser -g appuser /home/appuser/.tradingagents/portal
COPY --from=runtime /opt/venv /opt/venv
COPY --from=web --chown=appuser:appuser /web/dist /app/tradingagents_ui/web/dist
WORKDIR /app
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=15s --start-period=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=10)"
CMD ["tradingagents-ui"]
