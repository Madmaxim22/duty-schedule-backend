#!/bin/sh
# Поднять стек Duty после загрузки NAS.
# OpenMediaVault: System → Scheduled Tasks (Postboot), путь из Storage → Shared Folders → Absolute.
# Synology: Task Scheduler → Boot-up.

# Дать OMV смонтировать HDD (/srv/...) до docker compose
sleep 120

set -e
BASE=/srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data

# Сеть NPM ↔ Duty (внешняя, создаётся один раз)
docker network inspect duty-proxy >/dev/null 2>&1 || docker network create duty-proxy

# Nginx Proxy Manager (HTTPS), если установлен
if [ -f "$BASE/docker/npm/docker-compose.yml" ]; then
  cd "$BASE/docker/npm"
  docker compose up -d
fi

# Duty
cd "$BASE/duty-schedule/duty-schedule-backend"
docker compose up -d
