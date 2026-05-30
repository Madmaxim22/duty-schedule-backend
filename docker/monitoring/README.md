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
sed -i 's/\r$//' scripts/fetch-grafana-dashboards.sh 2>/dev/null || true
sh scripts/fetch-grafana-dashboards.sh   # Node Exporter 22479, Docker 14282, PostgreSQL 14114

docker compose up -d
docker compose ps
```

### Проверка targets

```bash
curl -s http://127.0.0.1:9090/-/healthy
curl -s http://127.0.0.1:9090/api/v1/targets | grep -o '"health":"[^"]*"' | sort | uniq -c
# ожидается "health":"up" для всех job
```

Локально Grafana: `http://<IP_NAS>:3000` (порт **3000**, не 8888). С NAS: `http://127.0.0.1:3000`. Логин из `.env`.

> По умолчанию Grafana слушает **все интерфейсы** (`GRAFANA_HOST_BIND=0.0.0.0`). Порт **3000 не пробрасывать на роутере** — только LAN. Prometheus/Alertmanager остаются на 127.0.0.1.

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
| Node Exporter Full | grafana.com/22479 | CPU, RAM, disk, network хоста |
| Docker cAdvisor | grafana.com/14282 | все Docker-контейнеры |
| PostgreSQL | grafana.com/14114 | БД duty_schedule |

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
| Grafana | `0.0.0.0:3000` (LAN) + NPM :443 — **не** пробрасывать 3000 в WAN |

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

**`fetch-grafana-dashboards.sh`: Отказано в доступе / sudo: command not found** — нет `+x` или файл с CRLF (Windows). Из каталога `docker/monitoring`:

```bash
sed -i 's/\r$//' scripts/fetch-grafana-dashboards.sh
chmod +x scripts/fetch-grafana-dashboards.sh
sh scripts/fetch-grafana-dashboards.sh
```

`sudo` для этого скрипта не нужен — он только скачивает JSON в `grafana/provisioning/dashboards/community/`.

**Grafana недоступна из LAN (`192.168.x.x:3000`)** — в старых версиях compose порт был `127.0.0.1:3000` (только NAS). Обновите `docker-compose.yml`, в `.env` задайте `GRAFANA_HOST_BIND=0.0.0.0`, затем `docker compose up -d grafana`. Проверка на NAS: `curl -s -o /dev/null -w "%{http_code}" http://192.168.3.85:3000/login` → `200`. Порт **8888** — не Grafana. Firewall OMV: разрешить TCP **3000** из LAN при необходимости.

**Редirect на grafana.duty-w.ru при входе по IP** — в `.env` временно `GF_SERVER_ROOT_URL=http://192.168.3.85:3000` или открывайте `https://grafana.duty-w.ru` из LAN (DNS на IP NAS).

**«Depends on Angular» / Failed to upgrade legacy queries** — старые community-дашборды (1860, 893, 9628). **Duty Overview** не затронут — используйте его для ежедневного мониторинга. Перекачайте современные версии:

```bash
cd /srv/.../docker/monitoring
git pull   # скрипт теперь качает 22479, 14282, 14114
sh scripts/fetch-grafana-dashboards.sh
docker compose restart grafana
```

Кнопка **Try migration** в UI иногда помогает, но надёжнее перекачать JSON.

**`docker compose up -d`: TLS handshake timeout / failed to copy** — нестабильный канал до Docker Hub (CDN CloudFront). Часть образов уже скачана; повторите:

```bash
cd /srv/.../docker/monitoring
docker compose pull
docker compose up -d
```

Если снова обрывается — тяните по одному (можно несколько раз один и тот же):

```bash
docker pull prom/node-exporter:v1.8.2
docker pull prom/prometheus:v2.53.0
docker pull prom/alertmanager:v0.27.0
docker pull grafana/grafana:11.2.0
docker pull prom/blackbox-exporter:v0.25.0
docker pull gcr.io/cadvisor/cadvisor:v0.49.1
docker compose up -d
```

Проверка доступа к registry: `curl -I --max-time 15 https://registry-1.docker.io/v2/`

При частых обрывах на OMV: **Services → Compose → Settings → Docker** или `/etc/docker/daemon.json` — зеркало registry (например Timeweb `https://dockerhub.timeweb.cloud`), затем `systemctl restart docker` и снова `docker compose pull`.
