# Nginx Proxy Manager для Duty

[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://madmaxim22.github.io/duty-schedule/)

Отдельный compose-стек: TLS на **443**, проксирование на контейнер Duty **`duty-nginx:80`**.

NPM и Duty — **разные** compose-проекты. `127.0.0.1:8080` в Proxy Host **не работает** (502): для NPM это localhost своего контейнера, а не NAS. Используйте общую сеть `duty-proxy`.

## Быстрый старт на OMV

```bash
docker network create duty-proxy   # один раз

mkdir -p /srv/.../docker/npm
# скопируйте docker-compose.yml в эту папку
cd /srv/.../docker/npm
docker compose up -d

# Duty должен быть в той же сети (container_name: duty-nginx в docker-compose.yml)
cd /srv/.../duty-schedule/duty-schedule-backend
docker compose up -d
```

Админка: `http://<IP_NAS>:81` — смените пароль по умолчанию (`admin@example.com` / `changeme`).

## Proxy Host

| Поле | Значение |
|------|----------|
| Domain Names | `duty-w.ru` |
| Scheme | `http` |
| Forward Hostname / IP | `duty-nginx` |
| Forward Port | `80` |
| SSL | Request Let's Encrypt, Force SSL |

**Лимит загрузки (413):** в `docker-compose.yml` смонтирован `./custom/server_proxy.conf` → `client_max_body_size 16m` для всех proxy hosts. После копирования compose на NAS:

```bash
cd /srv/.../docker/npm
docker compose up -d
```

Проверка внутри NPM: `docker exec <npm-container> nginx -T 2>/dev/null | grep client_max_body_size`

Только строка в **Advanced** иногда **не работает** (баг/порядок директив NPM). Тогда не полагайтесь на Advanced для лимита — достаточно `server_proxy.conf`.

**Advanced → Custom Nginx Configuration** (заголовки; `client_max_body_size` здесь опционально, если уже есть `server_proxy.conf`):

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

**Duty-nginx** (второй слой): на NAS `git pull` в `duty-schedule-backend` и `docker compose up -d nginx` — в `nginx.conf` тоже должно быть `client_max_body_size 16m;`. Без этого 413 останется, даже если NPM исправлен.

**Trust Upstream Forwarded Proto** — выключить (NPM — крайний прокси).

Проверка с NAS: `curl -s http://127.0.0.1:8080/api/health` и `curl -s https://duty-w.ru/api/health` — оба `{"status":"ok"}`.

Полная инструкция: корневой [README.md](../../../README.md) — раздел HTTPS.
