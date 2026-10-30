FROM node:22-bookworm-slim AS frontend
WORKDIR /frontend
COPY portal/frontend/package*.json ./
RUN npm ci
COPY portal/frontend/ ./
COPY portal/schema/ /schema/
ARG PORTAL_API_URL=/api
ENV PORTAL_API_URL=${PORTAL_API_URL}
RUN npm run build

FROM python:3.13-slim AS backend
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY pyproject.toml README.md LICENSE ./
COPY tradingagents/ tradingagents/
COPY cli/ cli/
COPY portal/__init__.py portal/__init__.py
COPY portal/backend/ portal/backend/
RUN pip install --no-cache-dir '.[portal]'

FROM python:3.13-slim
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    PORTAL_HOST=0.0.0.0 PORTAL_PORT=8000 PORTAL_STATIC_DIR=/app/portal/frontend/dist
RUN useradd --create-home appuser \
 && install -d -m 0700 -o appuser -g appuser /home/appuser/.tradingagents/portal
COPY --from=backend /opt/venv /opt/venv
COPY --from=frontend --chown=appuser:appuser /frontend/dist /app/portal/frontend/dist
WORKDIR /app
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=15s --start-period=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=10)"
CMD ["tradingagents-portal"]
