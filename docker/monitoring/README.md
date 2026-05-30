# Мониторинг NAS (OMV7) — Prometheus + Grafana

[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://madmaxim22.github.io/duty-schedule/)

Отдельный Docker-стек: метрики хоста OMV7, контейнеров Duty/NPM и PostgreSQL. Grafana доступна через **Nginx Proxy Manager** на `https://grafana.duty-w.ru`.

Prometheus, Alertmanager и exporters слушают только **127.0.0.1** на NAS — **не** открывайте порты 9090/9100/9187 в WAN.

## Пути на NAS (OMV)

| Назначение | Путь |
|------------|------|
| Корень monitoring | `/srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/docker/monitoring/` |
| Duty backend | `/srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/duty-schedule/duty-schedule-backend/` |

## Быстрый старт на OMV

### Предварительные условия

1. Работают стеки **NPM** и **Duty** (сеть `duty-proxy`, контейнер `duty-nginx`).
2. В Duty compose создана сеть **`duty-internal`** (для `postgres_exporter` → `db`). После `git pull`:

```bash
cd /srv/.../duty-schedule/duty-schedule-backend
docker compose up -d
docker network ls | grep duty
# duty-proxy, duty-internal
```

3. DNS: A-запись **`grafana.duty-w.ru`** → публичный IP NAS.

### Установка

```bash
BASE=/srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data
MON_ROOT="$BASE/docker/monitoring"

mkdir -p "$MON_ROOT"
# скопируйте содержимое duty-schedule-backend/docker/monitoring/ в $MON_ROOT

cd "$MON_ROOT"
cp .env.example .env
nano .env   # GF_SECURITY_ADMIN_PASSWORD, POSTGRES_EXPORTER_DSN при смене пароля БД

chmod +x scripts/fetch-grafana-dashboards.sh
./scripts/fetch-grafana-dashboards.sh   # Node Exporter 1860, Docker 893, PostgreSQL 9628

docker compose up -d
docker compose ps
```

### Проверка targets

```bash
curl -s http://127.0.0.1:9090/-/healthy
curl -s http://127.0.0.1:9090/api/v1/targets | grep -o '"health":"[^"]*"' | sort | uniq -c
# ожидается "health":"up" для всех job
```

Локально Grafana: `http://127.0.0.1:3000` (логин из `.env`).

## NPM Proxy Host (grafana.duty-w.ru)

**Hosts → Proxy Hosts → Add Proxy Host**

| Поле | Значение |
|------|----------|
| Domain Names | `grafana.duty-w.ru` |
| Scheme | `http` |
| Forward Hostname / IP | `monitoring-grafana` |
| Forward Port | `3000` |
| Block Common Exploits | вкл. |
| Websockets Support | **Off** |

**SSL:** Request a new SSL Certificate, Force SSL.

В `.env` monitoring должны совпадать:

```env
GF_SERVER_ROOT_URL=https://grafana.duty-w.ru
GF_SERVER_DOMAIN=grafana.duty-w.ru
```

После смены `.env`: `docker compose up -d grafana`.

Проверка: `https://grafana.duty-w.ru` — логин, папка **Duty** → dashboard **Duty Overview**.

Опционально: **Access List** в NPM (whitelist LAN) поверх пароля Grafana.

## Дашборды

| Dashboard | Источник | Содержание |
|-----------|----------|------------|
| Duty Overview | provisioning (json/) | health, SSL, disk /srv, контейнеры |
| Node Exporter Full | grafana.com/1860 | CPU, RAM, disk, network хоста |
| Docker cAdvisor | grafana.com/893 | все Docker-контейнеры |
| PostgreSQL | grafana.com/9628 | БД duty_schedule |

Community dashboards загружаются скриптом `scripts/fetch-grafana-dashboards.sh` (нужны `curl`, `jq`).

## Алерты

Правила: `prometheus/alerts/duty.yml`. UI Alertmanager: `http://127.0.0.1:9093` (только LAN/SSH).

| Alert | Условие |
|-------|---------|
| DiskSpaceLow | &lt; 15% на `/srv` |
| DiskSpaceCritical | &lt; 5% |
| HighMemory | RAM &gt; 90% |
| DutyHealthFailed | blackbox probe fail |
| PostgresDown | pg_up == 0 |
| SSLCertExpiringSoon | &lt; 14 дней |
| DutyContainerMissing | duty-nginx не виден cAdvisor |

Для Telegram/email отредактируйте `alertmanager/alertmanager.yml` (webhook_configs / email_configs).

## Сети Docker

| Сеть | Назначение |
|------|------------|
| `monitoring` | внутренняя (prometheus ↔ exporters ↔ grafana) |
| `duty-proxy` (external) | blackbox → duty-nginx, grafana ← NPM |
| `duty-internal` (external) | postgres_exporter → db |

Если `duty-internal` отсутствует — перезапустите Duty compose после `git pull`.

## Порты (только localhost)

| Сервис | Порт |
|--------|------|
| Prometheus | 127.0.0.1:9090 |
| Alertmanager | 127.0.0.1:9093 |
| Grafana | 127.0.0.1:3000 (+ NPM :443) |

## Автозапуск

Стек поднимается скриптом [`scripts/nas-start.sh`](../../scripts/nas-start.sh) после NPM и Duty (Postboot OMV).

## Переменные `.env`

| Переменная | Описание |
|------------|----------|
| `GF_SECURITY_ADMIN_PASSWORD` | пароль admin Grafana |
| `GF_SERVER_ROOT_URL` | публичный URL (`https://grafana.duty-w.ru`) |
| `POSTGRES_EXPORTER_DSN` | DSN PostgreSQL Duty |

## Устранение неполадок

**postgres target DOWN:** проверьте сеть `duty-internal` и что контейнер `db` запущен.

**blackbox_duty_http DOWN:** Duty nginx должен быть в `duty-proxy`; имя контейнера — `duty-nginx`.

**blackbox_duty_https DOWN:** DNS, NPM, сертификат duty-w.ru; probe идёт из контейнера blackbox в интернет.

**Пустые панели disk /srv:** на node_exporter mountpoint может быть `/host/root/srv/...` — запросы в dashboard учитывают оба варианта.

**Prometheus targets после reboot:** дождитесь `nas-start.sh` (sleep 120) или `docker compose up -d` вручную.
