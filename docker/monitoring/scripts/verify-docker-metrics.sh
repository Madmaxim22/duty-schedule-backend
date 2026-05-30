#!/bin/sh
# Диагностика dockerprom → Prometheus (OMV + containerd snapshotter).
# Запуск: sh scripts/verify-docker-metrics.sh

set -e
PROM="${PROM:-http://127.0.0.1:9090}"
CONTAINERS_DIR="${DOCKER_CONTAINERS_DIR:-/srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker/containers}"

echo "=== 0. Docker storage (OMV) ==="
docker info 2>/dev/null | grep -E 'Storage Driver|driver-type|Docker Root Dir|Cgroup Driver|Cgroup Version' || true
echo "DOCKER_CONTAINERS_DIR=${CONTAINERS_DIR}"
if [ -d "$CONTAINERS_DIR" ]; then
  echo "containers dir: $(ls "$CONTAINERS_DIR" 2>/dev/null | wc -l) entries"
else
  echo "WARN: $CONTAINERS_DIR не найден — проверьте DOCKER_CONTAINERS_DIR в .env"
fi

echo ""
echo "=== 1. Target docker (prometheus) ==="
curl -sf "$PROM/api/v1/targets" 2>/dev/null | tr '{' '\n' | grep -E 'job.*docker|health' | head -6 || echo "prometheus недоступен или target docker не настроен (git pull + restart prometheus)"

echo ""
echo "=== 2. Метрики dockerprom напрямую ==="
DP=$(docker ps --filter 'name=dockerprom' --format '{{.Names}}' | head -1)
if [ -n "$DP" ]; then
  docker exec "$DP" wget -qO- http://127.0.0.1:3000/ 2>/dev/null | grep -E '^container_(memory|cpu)' | head -8 || echo "(нет container_* метрик в dockerprom)"
else
  echo "контейнер dockerprom не найден — docker compose up -d dockerprom"
fi

echo ""
echo "=== 3. Контейнеры в Prometheus ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=count(container_memory_usage)' 2>/dev/null \
  | grep -o '"value":\[[^]]*\]' || echo "(пусто — подождите 30s после up и restart prometheus)"

echo ""
echo "=== 4. Имена контейнеров ==="
curl -sfG "$PROM/api/v1/label/name/values" --data-urlencode 'match[]=container_memory_usage' 2>/dev/null \
  | tr ',' '\n' | grep -v '^\[' | head -25 || true

echo ""
echo "=== 5. duty-nginx ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=container_memory_usage{name=~".*duty-nginx.*"}' 2>/dev/null | head -c 400
echo ""

echo ""
echo "=== 6. prometheus.yml (job docker) ==="
PROM_C=$(docker ps --filter 'name=prometheus' --format '{{.Names}}' | head -1)
if [ -n "$PROM_C" ]; then
  docker exec "$PROM_C" grep -A4 'job_name: docker' /etc/prometheus/prometheus.yml 2>/dev/null || true
fi
