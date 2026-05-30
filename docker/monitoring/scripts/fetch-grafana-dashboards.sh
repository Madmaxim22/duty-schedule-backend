#!/bin/sh
# Скачивает community dashboards Grafana в provisioning/community/.
# Запуск на NAS: sh scripts/fetch-grafana-dashboards.sh

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
      def prom: {"type": "prometheus", "uid": "prometheus"};
      def fix_ds:
        if (.datasource | type) == "string"
           and (.datasource == "Prometheus" or (.datasource | test("^\\$\\{DS_"))) then
          .datasource = prom
        elif (.datasource | type) == "object"
           and ((.datasource.uid? // "") | test("^\\$\\{DS_")) then
          .datasource = prom
        elif (.datasource | type) == "object" and .datasource.type? == "datasource" then
          .datasource = prom
        else .
        end;

      . + {"id": null, "uid": null, "__inputs": [], "__requires": []}
      | walk(if type == "object" and has("datasource") then fix_ds else . end)
      | if .templating.list? then
          .templating.list |= map(
            (if has("datasource") then fix_ds else . end)
            | if .type == "datasource" then
                .current = {"selected": true, "text": "Prometheus", "value": "prometheus"}
                | .query = "prometheus"
              else .
              end
          )
        else .
        end
    ' \
    > "$OUT/${name}.json"
}

# 11074 — Node Exporter NAS (НЕ 22479 — Shelly Pro 3EM)
fetch 11074 node-exporter-full
fetch 14282 docker-cadvisor
fetch 14114 postgresql-database

echo "Done. Dashboards saved to $OUT"
