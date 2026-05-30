#!/bin/sh
# Скачивает community dashboards Grafana в provisioning/community/.
# Запуск на NAS перед первым docker compose up -d (нужен curl и jq).

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
