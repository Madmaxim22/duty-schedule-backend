# Nginx Proxy Manager для Duty

Отдельный compose-стек: TLS на **443**, проксирование на контейнер Duty **`duty-nginx:80`**.

NPM и Duty — **разные** compose-проекты. `127.0.0.1:8080` в Proxy Host **не работает** (502): для NPM это localhost своего контейнера, а не NAS. Используйте общую сеть `duty-proxy`.

## Пути на NAS (OMV)

| Назначение | Путь |
|------------|------|
| Корень NPM | `/srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/docker/npm/` |
| `server_proxy.conf` (volume) | `/srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/docker/npm/data/nginx/custom/server_proxy.conf` |
| `server_proxy.conf` (bind mount) | `/srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/docker/npm/custom/server_proxy.conf` |

Редактирование на NAS:

```bash
sudo nano /srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/docker/npm/data/nginx/custom/server_proxy.conf
# или (если используется bind mount из docker-compose.yml):
sudo nano /srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/docker/npm/custom/server_proxy.conf
cd /srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/docker/npm
docker compose up -d
```

## Быстрый старт на OMV

```bash
docker network create duty-proxy   # один раз

NPM_ROOT=/srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/docker/npm
mkdir -p "$NPM_ROOT"
# скопируйте docker-compose.yml и custom/ в эту папку
cd "$NPM_ROOT"
docker compose up -d

# Duty должен быть в той же сети (container_name: duty-nginx в docker-compose.yml)
cd /srv/dev-disk-by-uuid-7b779ac5-3f1c-4c5d-98bc-5ed97247f35c/docker_data/duty-schedule/duty-schedule-backend
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

**Лимит загрузки (413):** нужны **два** слоя — и NPM, и duty-nginx (см. ниже). Загрузка ~25 МБ при лимите 16m даёт **413** с `server: openresty` — это ответ **NPM**, не duty-nginx.

### NPM — обязательно в Advanced (location /)

`server_proxy.conf` попадает в **server**-блок, а NPM задаёт `client_max_body_size` внутри **`location /`**. Лимит location **перекрывает** server → одного `server_proxy.conf` недостаточно.

Админка NPM → **Hosts → Proxy Hosts → duty-w.ru → Edit → Advanced** → Custom Nginx Configuration:

```nginx
client_max_body_size 80m;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Сохранить → Save. Перезапуск NPM не нужен (конфиг перегенерируется).

Дополнительно в `docker-compose.yml` смонтирован `./custom/server_proxy.conf` → `80m` на уровне server (запас для других hosts):

```bash
cd /srv/.../docker/npm
docker compose up -d
```

**Проверка лимита именно для duty-w.ru** (не общий grep):

```bash
docker exec npm-npm-1 nginx -T 2>/dev/null | grep -A80 'server_name duty-w.ru' | grep client_max_body_size
```

Должно быть **`80m` внутри блока `location /`** для этого хоста. Если видите только `1m` или `16m` — правка Advanced не сохранилась.

**Duty-nginx** (второй слой): на NAS `git pull` в `duty-schedule-backend` и `docker compose up -d nginx` — в `nginx.conf` тоже должно быть `client_max_body_size 80m;`. Без этого 413 останется, даже если NPM исправлен.

**Trust Upstream Forwarded Proto** — выключить (NPM — крайний прокси).

Проверка с NAS: `curl -s http://127.0.0.1:8080/api/health` и `curl -s https://duty-w.ru/api/health` — оба `{"status":"ok"}`.

Полная инструкция: корневой [README.md](../../../README.md) — раздел HTTPS.
