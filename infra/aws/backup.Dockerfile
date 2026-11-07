# The nightly backup job: the API image plus the tools apps/api/scripts/backup_db.py calls
# (pg_dump/psql 16, gpg). The S3 copy is made by backup.sh on the host, not in here, so no
# container ever needs AWS credentials (the instance keeps the metadata hop limit at 1).
ARG API_IMAGE=agent-finder-api:current
FROM ${API_IMAGE}
USER root
# pg_dump must be at least as new as the server (16); Debian's own client may be older, so it
# comes from the PostgreSQL project's repository.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && . /etc/os-release \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*
# backup_db.py finds "the repository" three folders above itself (REPO = parents[3]) to refuse
# backups inside it; from /app/scripts there is no third parent and the import fails. A copy at
# the repository's own depth (apps/api) makes REPO=/srv/agent-finder, and /backups stays outside it.
RUN mkdir -p /srv/agent-finder/apps && cp -a /app /srv/agent-finder/apps/api \
 && chown -R api:api /srv/agent-finder
WORKDIR /srv/agent-finder/apps/api
USER api
