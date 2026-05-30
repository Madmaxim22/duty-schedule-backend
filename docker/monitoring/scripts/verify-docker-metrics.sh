#!/bin/sh
# Диагностика dockerprom → Prometheus (OMV + containerd snapshotter).
# Запуск: sh scripts/verify-docker-metrics.sh

PROM="${PROM:-http://127.0.0.1:9090}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
MON_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

# .env рядом с compose (DOCKER_CONTAINERS_DIR)
if [ -f "$MON_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  . "$MON_ROOT/.env"
fi

ROOT=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo '')
CONTAINERS_DIR="${DOCKER_CONTAINERS_DIR:-${ROOT}/containers}"

echo "=== 0. Docker storage (OMV) ==="
docker info 2>/dev/null | grep -E 'Storage Driver|driver-type|Docker Root Dir|Cgroup Driver|Cgroup Version' || true
echo "compose dir: $MON_ROOT"
echo "DOCKER_CONTAINERS_DIR=${CONTAINERS_DIR}"
if [ -n "$CONTAINERS_DIR" ] && [ -d "$CONTAINERS_DIR" ]; then
  echo "containers dir: $(ls "$CONTAINERS_DIR" 2>/dev/null | wc -l) entries"
elif [ -n "$ROOT" ]; then
  echo "INFO: ${CONTAINERS_DIR:-?} не найден — на containerd snapshotter dockerprom часто работает только через cgroup (это нормально)"
  find "$ROOT" -maxdepth 4 -type d -name containers 2>/dev/null | head -3 | sed 's/^/  candidate: /' || true
else
  echo "WARN: docker info недоступен"
fi

echo ""
echo "=== 1. Targets Prometheus (docker / cadvisor) ==="
TARGETS=$(curl -sf "$PROM/api/v1/targets" 2>/dev/null) || TARGETS=""
if [ -z "$TARGETS" ]; then
  echo "prometheus недоступен на $PROM"
else
  echo "$TARGETS" | tr '{' '\n' | grep -E '"job":"(docker|cadvisor)"|"health":"' | head -20
  if echo "$TARGETS" | grep -q '"job":"cadvisor"'; then
    echo ""
    echo ">>> СТАРЫЙ конфиг: job cadvisor. Нужен git pull + recreate prometheus (см. README)."
  fi
  if ! echo "$TARGETS" | grep -q '"job":"docker"'; then
    echo ""
    echo ">>> job docker отсутствует — prometheus.yml не обновлён или контейнер поднят из другого каталога."
  fi
fi

echo ""
echo "=== 2. Метрики dockerprom напрямую ==="
DP=$(docker ps --filter 'name=dockerprom' --format '{{.Names}}' | head -1)
if [ -n "$DP" ]; then
  METRICS=$(docker exec "$DP" wget -qO- http://127.0.0.1:3000/ 2>/dev/null) || METRICS=""
  if [ -n "$METRICS" ]; then
    echo "$METRICS" | grep -E '^container_memory_usage' | wc -l | xargs echo "container_memory_usage series:"
    echo "$METRICS" | grep -E '^container_memory_usage' | head -5
    echo "$METRICS" | grep -E 'duty-nginx' | head -2 || echo "(duty-nginx не в первых метках — проверьте docker ps | grep duty-nginx)"
  else
    echo "(нет ответа от dockerprom:3000)"
  fi
else
  echo "контейнер dockerprom не найден — docker compose up -d dockerprom"
fi

echo ""
echo "=== 3. Контейнеры в Prometheus ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=count(container_memory_usage)' 2>/dev/null \
  | grep -o '"value":\[[^]]*\]' || echo "(пусто — см. п.1 и п.6)"

echo ""
echo "=== 4. Имена контейнеров (Prometheus) ==="
curl -sfG "$PROM/api/v1/label/name/values" --data-urlencode 'match[]=container_memory_usage' 2>/dev/null \
  | tr ',' '\n' | grep -v '^\[' | head -25 || true

echo ""
echo "=== 5. duty-nginx ==="
curl -sfG "$PROM/api/v1/query" --data-urlencode 'query=container_memory_usage{name=~".*duty-nginx.*"}' 2>/dev/null | head -c 400
echo ""

echo ""
echo "=== 6. prometheus.yml внутри контейнера ==="
PROM_C=$(docker ps --filter 'name=prometheus' --format '{{.Names}}' | head -1)
if [ -n "$PROM_C" ]; then
  docker exec "$PROM_C" grep -E 'job_name: (docker|cadvisor)' /etc/prometheus/prometheus.yml 2>/dev/null \
    || echo "(нет job docker/cadvisor в prometheus.yml)"
  echo "mount source:"
  docker inspect "$PROM_C" --format '{{range .Mounts}}{{if eq .Destination "/etc/prometheus/prometheus.yml"}}{{.Source}}{{end}}{{end}}' 2>/dev/null
else
  echo "контейнер prometheus не найден"
fi

echo ""
echo "=== 7. Быстрое исправление (если п.1 cadvisor или нет docker) ==="
echo "cd $MON_ROOT"
echo "git pull"
echo "docker compose stop cadvisor docker_exporter 2>/dev/null; docker compose rm -f cadvisor docker_exporter 2>/dev/null"
echo "docker compose up -d --force-recreate prometheus dockerprom"
echo "curl -X POST http://127.0.0.1:9090/-/reload   # или restart prometheus"
echo "sleep 30 && sh scripts/verify-docker-metrics.sh"
