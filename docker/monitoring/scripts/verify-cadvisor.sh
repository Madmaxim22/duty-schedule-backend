#!/bin/sh
# Диагностика cAdvisor → Prometheus на NAS.
# Запуск: sh scripts/verify-cadvisor.sh

set -e
PROM="${PROM:-http://127.0.0.1:9090}"

echo "=== 1. Target cadvisor ==="
curl -sf "$PROM/api/v1/targets" | grep -o '"job":"cadvisor"[^}]*"health":"[^"]*"' | head -3 || echo "cadvisor target not found"

echo ""
echo "=== 2. Всего series container_cpu_usage_seconds_total ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=count(container_cpu_usage_seconds_total)' \
  | grep -o '"value":\[[^]]*\]' || true

echo ""
echo "=== 3. С image (реальные контейнеры) ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=count(container_cpu_usage_seconds_total{image!=""})' \
  | grep -o '"value":\[[^]]*\]' || true

echo ""
echo "=== 4. Compose service labels ==="
curl -sfG "$PROM/api/v1/label/container_label_com_docker_compose_service/values" \
  | tr ',' '\n' | grep -v '^\[' | head -20 || true

echo ""
echo "=== 5. cAdvisor /metrics (первые строки container_cpu) ==="
CID=$(docker ps --filter 'name=cadvisor' --format '{{.Names}}' | head -1)
if [ -n "$CID" ]; then
  docker exec "$CID" wget -qO- http://127.0.0.1:8080/metrics 2>/dev/null | grep '^container_cpu_usage_seconds_total' | head -5
else
  echo "контейнер cadvisor не найден"
fi

echo ""
echo "=== 6. Логи cadvisor (последние ошибки) ==="
docker logs "$CID" 2>&1 | tail -15
