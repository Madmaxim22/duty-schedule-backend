#!/bin/sh
# Скачивает community dashboards Grafana в provisioning/community/.
# Запуск на NAS перед первым docker compose up -d (нужны curl и jq).
#
# Запуск (из каталога docker/monitoring):
#   sh scripts/fetch-grafana-dashboards.sh
# или:
#   chmod +x scripts/fetch-grafana-dashboards.sh && ./scripts/fetch-grafana-dashboards.sh
#
# Если после git clone «Отказано в доступе» / sudo: command not found — CRLF:
#   sed -i 's/\r$//' scripts/fetch-grafana-dashboards.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/grafana/provisioning/dashboards/community"
mkdir -p "$OUT"

fetch() {
  id="$1"
  name="$2"
  echo "Fetching dashboard $id ($name)..."
  curl -sf "https://grafana.com/api/dashboards/${id}/revisions/latest/download" \
    | jq '. + {"id": null, "uid": null}' \
    > "$OUT/${name}.json"
}

fetch 1860 node-exporter-full
fetch 893 docker-cadvisor
fetch 9628 postgresql-database

echo "Done. Dashboards saved to $OUT"
