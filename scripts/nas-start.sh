#!/bin/sh
# Поднять стек Duty после загрузки NAS.
# OpenMediaVault: System → Scheduled Tasks (Postboot), путь из Storage → Shared Folders → Absolute.
# Synology: Task Scheduler → Boot-up.

# Дать OMV смонтировать HDD (/srv/...) до docker compose
sleep 120

set -e
# OMV — путь проекта на NAS (muhomedyarovma@nas):
cd /srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/duty-schedule/duty-schedule-backend

docker compose up -d
