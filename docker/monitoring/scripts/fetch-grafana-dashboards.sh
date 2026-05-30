#!/bin/sh
# Скачивает community dashboards Grafana в provisioning/community/.
# Запуск на NAS перед первым docker compose up -d (нужны curl и jq).
#
# Запуск (из каталога docker/monitoring):
#   sh scripts/fetch-grafana-dashboards.sh
#
# Если после git clone «Отказано в доступе» / sudo: command not found — CRLF:
#   sed -i 's/\r$//' scripts/fetch-grafana-dashboards.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/grafana/provisioning/dashboards/community"
mkdir -p "$OUT"

# Подставляет uid prometheus вместо ${DS_PROMETHEUS}, ${DS_GDEV-PROMETHEUS} и т.д.
JQ_FILTER='
  def prom: {"type": "prometheus", "uid": "prometheus"};
  def ds_placeholder(s):
    (s | type) == "string" and (s == "Prometheus" or (s | test("^\\$\\{DS_")));
  def fix_datasource_field:
    if (.datasource | ds_placeholder) then
      .datasource = prom
    elif (.datasource | type) == "object"
         and ((.datasource.uid? // "") | test("^\\$\\{DS_")) then
      .datasource = prom
    elif (.datasource | type) == "object" and .datasource.type? == "datasource" then
      .datasource = prom
    else .
    end;

  . + {"id": null, "uid": null, "__inputs": [], "__requires": []}
  | walk(if type == "object" and has("datasource") then fix_datasource_field else . end)
  | if .templating.list? then
      .templating.list |= map(
        if has("datasource") then fix_datasource_field else . end
        | if .type == "datasource" then
            .current = {"selected": true, "text": "Prometheus", "value": "prometheus"}
            | .query = "prometheus"
          else .
          end
      )
    else .
    end
'

fetch() {
  id="$1"
  name="$2"
  echo "Fetching dashboard $id ($name)..."
  curl -sf "https://grafana.com/api/dashboards/${id}/revisions/latest/download" \
    | jq "$JQ_FILTER" \
    > "$OUT/${name}.json"
}

# 11074 — Node Exporter (НЕ 22479: это Shelly Pro 3EM, чужой дашборд!)
fetch 11074 node-exporter-full
fetch 14282 docker-cadvisor
fetch 14114 postgresql-database

echo "Done. Dashboards saved to $OUT"
