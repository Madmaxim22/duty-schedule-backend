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

**Advanced → Custom Nginx Configuration:**

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

**Trust Upstream Forwarded Proto** — выключить (NPM — крайний прокси).

Проверка с NAS: `curl -s http://127.0.0.1:8080/api/health` и `curl -s https://duty-w.ru/api/health` — оба `{"status":"ok"}`.

Полная инструкция: корневой [README.md](../../../README.md) — раздел HTTPS.
