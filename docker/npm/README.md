# Nginx Proxy Manager для Duty

[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://madmaxim22.github.io/duty-schedule/)

Отдельный compose-стек: TLS на **443**, проксирование на Duty `http://127.0.0.1:8080`.

## Быстрый старт на OMV

```bash
mkdir -p /srv/.../docker/npm
# скопируйте docker-compose.yml в эту папку
cd /srv/.../docker/npm
docker compose up -d
```

Админка: `http://<IP_NAS>:81` — смените пароль по умолчанию (`admin@example.com` / `changeme`).

## Proxy Host

| Поле | Значение |
|------|----------|
| Domain Names | `duty-w.ru` |
| Forward | `127.0.0.1:8080` |
| SSL | Request Let's Encrypt, Force SSL |

**Advanced → Custom Nginx Configuration:**

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Полная инструкция: корневой [README.md](../../../README.md) — раздел HTTPS.
