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
    | jq '
      . + {"id": null, "uid": null, "__inputs": [], "__requires": []}
      | walk(
          if type == "object" and has("datasource") then
            if (.datasource | type) == "string"
               and (.datasource == "${DS_PROMETHEUS}" or .datasource == "Prometheus") then
              .datasource = {"type": "prometheus", "uid": "prometheus"}
            elif (.datasource | type) == "object"
               and ((.datasource.uid? // "") == "${DS_PROMETHEUS}"
                    or .datasource.type? == "datasource") then
              .datasource = {"type": "prometheus", "uid": "prometheus"}
            else .
            end
          else .
          end
        )
      | if .templating.list? then
          .templating.list |= map(
            if .type == "datasource" then
              .current = {"selected": true, "text": "Prometheus", "value": "prometheus"}
              | .query = "prometheus"
            else . end
          )
        else . end
    ' \
    > "$OUT/${name}.json"
}

# Community dashboards (React, без Angular — совместимы с Grafana 11+).
# Старые ID 1860/893/9628 давали предупреждение «depends on Angular».
fetch 22479 node-exporter-full
fetch 14282 docker-cadvisor
fetch 14114 postgresql-database

echo "Done. Dashboards saved to $OUT"
