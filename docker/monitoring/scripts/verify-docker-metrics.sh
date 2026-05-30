#!/bin/sh
# Диагностика docker_exporter → Prometheus (замена cAdvisor на OMV + containerd snapshotter).
# Запуск: sh scripts/verify-docker-metrics.sh

set -e
PROM="${PROM:-http://127.0.0.1:9090}"

echo "=== 0. Docker storage (OMV) ==="
docker info 2>/dev/null | grep -E 'Storage Driver|driver-type|Docker Root Dir' || true

echo ""
echo "=== 1. Target docker_exporter ==="
curl -sf "$PROM/api/v1/targets" | grep -o '"job":"docker"[^}]*"health":"[^"]*"' | head -3 || echo "docker target not found"

echo ""
echo "=== 2. Контейнеры в метриках ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=count(docker_container_info)' \
  | grep -o '"value":\[[^]]*\]' || true

echo ""
echo "=== 3. Имена контейнеров ==="
curl -sfG "$PROM/api/v1/label/name/values" --data-urlencode 'match[]=docker_container_info' 2>/dev/null \
  | tr ',' '\n' | grep -v '^\[' | head -30 || true

echo ""
echo "=== 4. duty-nginx ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=docker_container_info{name=~".*duty-nginx.*"}' \
  | head -c 500 || true
echo ""

echo ""
echo "=== 5. docker_exporter logs ==="
DE=$(docker ps --filter 'name=docker_exporter' --format '{{.Names}}' | head -1)
if [ -n "$DE" ]; then
  docker logs "$DE" 2>&1 | tail -8
else
  echo "контейнер docker_exporter не найден — docker compose up -d docker_exporter"
fi
