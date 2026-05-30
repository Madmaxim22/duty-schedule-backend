#!/bin/sh
# Диагностика cAdvisor → Prometheus на NAS.
# Запуск: sh scripts/verify-cadvisor.sh

set -e
PROM="${PROM:-http://127.0.0.1:9090}"
DOCKER_ROOT="${DOCKER_DATA_ROOT:-/srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker}"

echo "=== 0. Docker Root Dir (должен совпадать с DOCKER_DATA_ROOT в .env) ==="
docker info 2>/dev/null | grep -E 'Docker Root Dir|Storage Driver|driver-type|containerd' || true
echo "DOCKER_DATA_ROOT=${DOCKER_ROOT}"
if [ -d "$DOCKER_ROOT/image" ]; then
  echo "image store: $(ls "$DOCKER_ROOT/image" 2>/dev/null | tr '\n' ' ')"
else
  echo "WARN: $DOCKER_ROOT/image не найден"
fi

echo ""
echo "=== 1. Target cadvisor ==="
curl -sf "$PROM/api/v1/targets" | grep -o '"job":"cadvisor"[^}]*"health":"[^"]*"' | head -3 || echo "cadvisor target not found"

echo ""
echo "=== 2. container_cpu series (все) ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=count(container_cpu_usage_seconds_total)' \
  | grep -o '"value":\[[^]]*\]' || true

echo ""
echo "=== 3. С image (Docker-контейнеры) ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=count(container_cpu_usage_seconds_total{image!=""})' \
  | grep -o '"value":\[[^]]*\]' || true

echo ""
echo "=== 4. systemd docker scopes (fallback) ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=count(container_cpu_usage_seconds_total{id=~"/system.slice/docker-.*"})' \
  | grep -o '"value":\[[^]]*\]' || true

echo ""
echo "=== 5. Compose service labels ==="
curl -sfG "$PROM/api/v1/label/container_label_com_docker_compose_service/values" 2>/dev/null | tr ',' '\n' | head -20 || true

echo ""
echo "=== 6. cAdvisor /metrics (docker scopes) ==="
CID=$(docker ps --filter 'name=cadvisor' --format '{{.Names}}' | head -1)
if [ -n "$CID" ]; then
  docker exec "$CID" wget -qO- http://127.0.0.1:8080/metrics 2>/dev/null \
    | grep 'container_cpu_usage_seconds_total.*docker-' | head -5 || echo "(нет строк docker- в metrics)"
else
  echo "контейнер cadvisor не найден"
fi

echo ""
echo "=== 7. Логи cadvisor (ошибки overlay/layerdb) ==="
if [ -n "$CID" ]; then
  docker logs "$CID" 2>&1 | grep -E 'Failed|layer|mount-id|containerd' | tail -10 || echo "(нет ошибок в tail)"
fi

echo ""
echo "=== 8. containerd snapshotter? ==="
echo "Если mount-id errors и containerd-snapshotter=true — см. README «cAdvisor OMV»"
