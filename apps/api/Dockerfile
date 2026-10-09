# The API as one container, for Render, Fly.io, Railway or any host that runs an image.
# Build context: apps/api. Listens on $PORT (hosts set it), defaults to 8000.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app
COPY . .
RUN pip install --upgrade pip && pip install .

# Never root inside the container.
RUN useradd --create-home --uid 10001 api && chown -R api:api /app
USER api

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT','8000')).read()" || exit 1

# Migrations on Postgres, then the server (see docker-entrypoint.sh).
# APP_ENV=production refuses to start without CORS_ORIGINS, on purpose.
CMD ["./docker-entrypoint.sh"]
