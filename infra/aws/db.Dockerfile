# PostgreSQL 16 with PostGIS, for arm64 (the postgis/postgis images are amd64 only).
# The official postgres image already carries the PostgreSQL project's apt repository.
FROM postgres:16-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-postgis-3 postgresql-16-postgis-3-scripts \
 && rm -rf /var/lib/apt/lists/*
