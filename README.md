# График дежурств — Backend

REST API для мобильного веб-приложения учёта дежурств по кабинетам.

**Расположение в монорепозитории:** `C:\Users\Максим\Documents\Frontend\Duty\duty-schedule-backend`  
**Связанный frontend:** [duty-schedule-frontend](../duty-schedule-frontend)

## Содержание

- [Назначение](#назначение)
- [Стек](#стек)
- [Требования](#требования)
- [Быстрый старт](#быстрый-старт)
- [Переменные окружения](#переменные-окружения)
- [API](#api)
- [Структура дежурств](#структура-дежурств)
- [Запуск с телефона в локальной сети](#запуск-с-телефона-в-локальной-сети)
- [Docker](#docker)
- [Структура проекта](#структура-проекта)
- [Лицензия](#лицензия)

## Назначение

Сервер обеспечивает:

- регистрацию пользователей с модерацией администратором;
- аутентификацию (JWT access + refresh в httpOnly cookie);
- роли **admin** и **user**;
- хранение и выдачу графика дежурств по фиксированным кабинетам на каждый день.

## Стек

| Технология | Назначение |
|------------|------------|
| Node.js 20+ | runtime |
| Express 5 | HTTP API |
| TypeScript | типизация |
| PostgreSQL 14+ | БД |
| Prisma | ORM и миграции |
| bcrypt | хеширование паролей |
| jsonwebtoken | access / refresh токены |
| zod | валидация запросов |
| helmet, cors, express-rate-limit | безопасность |

## Требования

- [Node.js](https://nodejs.org/) 20 или новее
- [npm](https://www.npmjs.com/)
- **PostgreSQL** 14+ (локально или в Docker)

Проверка:

```bash
node -v
npm -v
```

## Быстрый старт

### 1. PostgreSQL

**Вариант A — локальная установка**

Создайте пользователя и базу (пример):

```sql
CREATE USER duty WITH PASSWORD 'duty';
CREATE DATABASE duty_schedule OWNER duty;
GRANT ALL PRIVILEGES ON DATABASE duty_schedule TO duty;
```

**Вариант B — только БД в Docker**

Из этой папки:

```bash
docker compose up -d db
```

Строка подключения: `postgresql://duty:duty@localhost:5432/duty_schedule`

### 2. Установка и настройка

```bash
cd duty-schedule-backend
npm install
copy .env.example .env   # Windows
# cp .env.example .env   # Linux / macOS
```

Отредактируйте `.env` (см. [переменные окружения](#переменные-окружения)).

### 3. Миграции и администратор

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

Скрипт `db:seed` создаёт учётную запись администратора, если её ещё нет.

### 4. Запуск в режиме разработки

```bash
npm run dev
```

Сервер: **http://localhost:3000**

Проверка:

```bash
curl http://localhost:3000/api/health
```

Ожидаемый ответ: `{"status":"ok"}`

### 5. Frontend

В соседней папке запустите [duty-schedule-frontend](../duty-schedule-frontend) (`npm run dev`).  
Интерфейс: **http://localhost:5173**

**Вход администратора по умолчанию** (из `.env`):

| Поле | Значение |
|------|----------|
| Email | `admin@duty.local` |
| Пароль | `admin123` |

> Смените пароль в production через `.env` до первого деплоя.

## Переменные окружения

Скопируйте `.env.example` в `.env`.

| Переменная | Описание | Пример |
|------------|----------|--------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://duty:duty@localhost:5432/duty_schedule` |
| `PORT` | Порт API | `3000` |
| `NODE_ENV` | Окружение | `development` |
| `JWT_SECRET` | Секрет access-токена | длинная случайная строка |
| `JWT_REFRESH_SECRET` | Секрет refresh-токена | другая случайная строка |
| `ACCESS_TOKEN_TTL` | Время жизни access | `30m` |
| `REFRESH_TOKEN_DAYS` | Срок refresh (дни) | `7` |
| `CORS_ORIGIN` | URL frontend (один origin) | `http://localhost:5173` |
| `ADMIN_EMAIL` | Email seed-админа | `admin@duty.local` |
| `ADMIN_PASSWORD` | Пароль seed-админа | `admin123` |
| `ADMIN_FULL_NAME` | ФИО админа | `Администратор` |
| `COOKIE_SECURE` | Secure cookie (HTTPS) | `false` локально, `true` на NAS (`https://duty-w.ru`) |
| `VAPID_PUBLIC_KEY` | Web Push (публичный ключ) | из `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Web Push (секрет) | не публиковать |
| `VAPID_SUBJECT` | Web Push contact | `mailto:admin@duty-w.ru` |
| `FIREBASE_PROJECT_ID` | FCM (Android APK) | Firebase Console |
| `FIREBASE_CLIENT_EMAIL` | Service Account | из JSON ключа |
| `FIREBASE_PRIVATE_KEY` | Service Account (с `\n`) | не публиковать |
| `GOOGLE_APPLICATION_CREDENTIALS` | Альтернатива: путь к JSON в контейнере | volume на NAS |
| `MAX_CHAT_ATTACHMENT_SIZE` | Макс. размер одного изображения в чате (байты) | `8388608` (8 МБ) |
| `MAX_CHAT_ATTACHMENTS_PER_MESSAGE` | Макс. изображений в одном сообщении | `10` |
| `CHAT_ATTACHMENT_ORPHAN_TTL_MS` | TTL «висячих» вложений до очистки (мс) | `3600000` (1 ч) |

Лимит тела запроса для пакетной загрузки фото: **80m** (10 × 8 МБ) в **duty-nginx** (`nginx/nginx.conf`, после правки — `docker compose up -d --force-recreate --no-deps nginx`) и в **NPM** — в **Advanced** Proxy Host `duty-w.ru` (`client_max_body_size 80m;` внутри `location /`; одного `server_proxy.conf` мало). Если 413 с `server: openresty` — узкое место NPM. Подробности: [docker/npm/README.md](docker/npm/README.md).

Файл `.env` **не коммитьте** в git.

### Push-уведомления (Web + FCM)

**Web Push (браузер / PWA):** `npx web-push generate-vapid-keys` → `VAPID_*` в `.env`.

**FCM (Android APK):** Firebase Console → Android app `ru.dutyw.schedule` → Service Account JSON → `FIREBASE_*` в `.env` на NAS (см. [duty-schedule-android/README.md](../duty-schedule-android/README.md#fcm-push-android-apk)).

Миграция: `npx prisma migrate deploy` (таблицы `push_subscriptions`, `fcm_device_tokens`).

Включение на клиенте: **Настройки → Уведомления** (браузер — VAPID; APK — FCM). `sendPushToUsers` шлёт **параллельно** на оба канала. Без VAPID/FCM API и регистрация не ломаются.

При `POST /auth/register` push уходит админам с активной подпиской (web и/или FCM).

Подробнее: [docs — Web Push](../docs/product/web-push.md).

## API

Базовый префикс: `/api`

### Аутентификация

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| POST | `/auth/register` | публичный | Регистрация → статус `pending` |
| POST | `/auth/login` | публичный | Вход (только `approved`) |
| POST | `/auth/refresh` | cookie | Новый access-токен |
| POST | `/auth/logout` | авторизован | Выход, удаление refresh |
| GET | `/auth/me` | авторизован | Текущий пользователь |

**Login** — в теле ответа `accessToken` (хранить на клиенте), refresh — в httpOnly cookie.

### Администрирование пользователей

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/users` | Все учётные записи |
| GET | `/admin/users/pending` | Список заявок на регистрацию |
| PATCH | `/admin/users/:id` | Тело: `{ "action": "approve" \| "reject" }` |
| DELETE | `/admin/users/:id` | Удаление пользователя (не себя и не admin) |

### Статистика (admin)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/statistics?year=2026&month=5` | По каждому `approved` пользователю: число дежурств и отсутствий за календарный месяц и за календарный год; разбивка отсутствий по `absence_type` с датами |

### Обращения администратору (support)

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| POST | `/support/threads` | approved user | Создать обращение + первое сообщение `{ "body" }` |
| GET | `/support/threads` | author | Список своих тредов |
| GET | `/support/threads/:id` | author или admin | Тред и все сообщения |
| POST | `/support/threads/:id/messages` | author (свой open) или admin (любой open) | Новое сообщение `{ "body" }` |
| GET | `/admin/support/threads` | admin | Все треды; `?status=open` (по умолчанию) или `closed` |
| GET | `/admin/support/threads/:id` | admin | Тред и сообщения |
| POST | `/admin/support/threads/:id/messages` | admin | Ответ в тред |
| PATCH | `/admin/support/threads/:id` | admin | `{ "status": "closed" }` |

При новом сообщении от пользователя — in-app уведомление и Web Push всем админам (`support_message`). При ответе админа — уведомление автору треда. Лимит: 10 POST на создание/сообщение за 15 мин на пользователя.

### Чат (1:1 и группы)

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| GET | `/chat/contacts` | approved | Список подтверждённых пользователей (для выбора участников) |
| GET | `/chat/unread-count` | member | Сумма непрочитанных сообщений по всем комнатам |
| GET | `/chat/rooms` | member | Список комнат с preview и `unreadCount` |
| POST | `/chat/rooms/direct` | approved | `{ "userId" }` — найти или создать личный чат |
| POST | `/chat/rooms/group` | approved | `{ "title", "memberIds" }` — группа (создатель входит в состав) |
| GET | `/chat/rooms/:id` | member | Метаданные и участники |
| GET | `/chat/rooms/:id/messages` | member | История; `?before=<ISO>&limit=50`; в каждом сообщении — `attachments[]` |
| POST | `/chat/rooms/:id/attachments` | member | multipart `files[]` (JPEG/PNG/WebP/GIF) — шаг 1: загрузка, ответ `{ attachments: [{ id, fileName, mimeType, size, url }] }` |
| POST | `/chat/rooms/:id/messages` | member | JSON `{ "body"?, "replyToMessageId"?, "attachmentIds"? }` — шаг 2: текст и/или привязка вложений; нужен `body` или `attachmentIds` |
| PATCH | `/chat/rooms/:id/read` | member | Отметить прочитанным (`lastReadAt`) |
| PUT | `/chat/rooms/:id/messages/:messageId/reactions` | member | `{ "emoji" }` — реакция на сообщение |
| DELETE | `/chat/rooms/:id/messages/:messageId/reactions` | member | Снять свою реакцию |
| DELETE | `/chat/rooms/:id/messages/:messageId` | member | `{ "mode": "me" \| "everyone" }` — скрыть у себя или удалить у всех (только своё); ответ: `{ "message" }` (tombstone) или `{ "ok": true }` |
| PATCH | `/chat/rooms/:id/messages/:messageId` | member (автор) | `{ "body": "...", "attachmentIds": ["uuid", ...] }` — редактировать своё сообщение (текст и набор вложений); ответ: `{ "message" }` с опциональным `editedAt` |

Файлы чата: `GET /uploads/chat/<id>.<ext>` (статика API). В preview списка комнат сообщение только с фото — текст «Фото»; удалённое у всех — «Сообщение удалено».

**WebSocket:** `ws(s)://<host>/api/ws/chat` — после connect первое сообщение `{ "type": "auth", "token": "<access JWT>" }`, затем `{ "type": "subscribe", "roomIds": ["..."] }`. События: `message.new` (в т.ч. `attachments`), `message.updated` (tombstone после удаления у всех), `message.hidden` (только инициатору после «удалить у меня»), `message.reaction`, `read.updated`, `room.updated`. Отправка — REST (двухшагово для вложений).

При новом сообщении — Web Push участникам (кроме автора), URL `/chat/:roomId` (тег `chat:{roomId}` в шторке). In-app лента `/notifications` чат не использует. Лимиты: 30 POST сообщений / 15 мин; 60 POST вложений / 15 мин; 60 DELETE сообщений / 15 мин на пользователя.

За reverse-proxy (nginx Duty) нужен проброс `Upgrade` / `Connection` до API (в актуальном `nginx/nginx.conf` — и в `location /api/ws/`, и в общем `location /api/`); в NPM — включить поддержку WebSockets для Proxy Host. Ответ Express `Cannot GET /api/ws/chat` означает, что handshake дошёл как обычный GET без upgrade.

### Push (Web + FCM)

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| GET | `/push/vapid-public-key` | публичный | Публичный VAPID (503 без ключей) |
| POST | `/push/subscribe` | approved | Web Push: сохранить подписку |
| DELETE | `/push/subscribe` | approved | `{ "endpoint" }` — отписаться |
| GET | `/push/fcm-status` | публичный | `{ "enabled": true/false }` — настроен ли FCM на сервере |
| POST | `/push/fcm-subscribe` | approved | `{ "token", "platform"? }` — FCM token из APK |
| DELETE | `/push/fcm-subscribe` | approved | `{ "token" }` — удалить token |

### Пользователи для назначений

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/users` | Список подтверждённых пользователей (для назначений) |
| GET | `/users?date=YYYY-MM-DD` | То же + флаги отсутствия на дату |

### Расписание

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/schedule/month?year=2026&month=5` | Дни месяца: `isMyDuty`, `duties`, `isAbsent?` |
| GET | `/schedule/day/:date` | Детали дня (`YYYY-MM-DD`), `myAbsence?` |
| PUT | `/schedule/day/:date` | Назначения на день (только admin); нельзя назначить отсутствующего |
| POST | `/schedule/import` | Импорт JSON: `absence` + `info` (только admin) |
| GET | `/schedule/changes` | Журнал изменений слотов (`limit`, `cursor`) |
| GET | `/schedule/sections` | Справочник секций и кабинетов |

**Пример PUT** `/schedule/day/2026-05-20`:

```json
{
  "assignments": [
    { "section": "A", "office": "51", "userId": "uuid-пользователя" },
    { "section": "A", "office": "52", "userId": null }
  ]
}
```

Нужно передать **все 8 слотов** (4 + 4). `userId: null` — слот пустой.

**Импорт:** `title` в `info` — последние 2 цифры = номер кабинета (`131` → каб. `31`, секция B). В диапазоне `replaceFrom`…`replaceTo` график дежурств совпадает с файлом: назначения вне `info` снимаются. Таблицы: `user_absences`, `duty_assignment_changes`.

### Коды ошибок

| Код | Ситуация |
|-----|----------|
| 401 | Нет или неверный токен |
| 403 | Нет прав / аккаунт не подтверждён |
| 409 | Email уже занят |

## Структура дежурств

**Секция A**

| Кабинет | Обязательный |
|---------|--------------|
| 51 | да |
| 52 | да |
| 53 | нет |
| 54 | нет |

**Секция B**

| Кабинет | Обязательный |
|---------|--------------|
| 31 | да |
| 32 | да |
| 33 | да |
| 34 | нет |

На пару `(дата, секция, кабинет)` — один пользователь.

## Запуск с телефона в локальной сети

1. Узнайте IPv4 ПК: `ipconfig` → например `192.168.1.105`.
2. В `.env` установите:  
   `CORS_ORIGIN=http://192.168.1.105:5173`
3. Перезапустите backend.
4. Frontend запускайте с доступом в сеть: `npm run dev -- --host`.
5. На телефоне (та же Wi‑Fi): `http://192.168.1.105:5173`.

Разрешите Node.js в брандмауэре Windows для частной сети.

## Docker

Рядом должен лежать клон frontend:

```
Duty/
  duty-schedule-backend/   ← вы здесь
  duty-schedule-frontend/
```

```bash
copy .env.example .env
# задайте JWT_SECRET, JWT_REFRESH_SECRET, CORS_ORIGIN
docker compose up -d --build
```

На NAS с HTTPS: см. `.env.production.nas.example`, [docker/npm/](docker/npm/), корневой README → «HTTPS (duty-w.ru)».

Сервисы:

| Сервис | Назначение |
|--------|------------|
| `db` | PostgreSQL 16 |
| `api` | Node API + миграции при старте |
| `web` | Статика frontend (nginx) |
| `nginx` | Прокси: `/` → web, `/api` → api (`127.0.0.1:8080` на NAS) |

Локально: **http://127.0.0.1:8080**. Production: **https://duty-w.ru** через Nginx Proxy Manager.

Мониторинг NAS (Prometheus + Grafana): отдельный стек [docker/monitoring/](docker/monitoring/) — метрики хоста, контейнеров и PostgreSQL; Grafana на **https://grafana.duty-w.ru**.

Характеристики железа production-NAS (плата, RAM, диски, порты): [docs/deployment/nas-hardware.md](../docs/deployment/nas-hardware.md) · [документация на сайте](https://docs.duty-w.ru/deployment/nas-hardware/).

## Структура проекта

```
duty-schedule-backend/
├── prisma/
│   ├── schema.prisma      # модели User, DutyAssignment, RefreshToken
│   ├── seed.ts            # создание admin
│   └── migrations/
├── src/
│   ├── index.ts           # точка входа
│   ├── app.ts             # Express, middleware, маршруты
│   ├── config/env.ts
│   ├── lib/               # jwt, password, offices, prisma
│   ├── middleware/        # auth, requireRole, errors
│   └── modules/
│       ├── auth/
│       ├── users/
│       └── schedule/
├── docker/
│   └── Dockerfile
├── docker-compose.yml
├── nginx/nginx.conf
├── .env.example
└── LICENSE
```

## Скрипты npm

| Команда | Описание |
|---------|----------|
| `npm run dev` | Разработка (tsx watch) |
| `npm run build` | Сборка в `dist/` |
| `npm start` | Production (`node dist/index.js`) |
| `npm run db:migrate` | Миграция в dev (`prisma migrate dev`) |
| `npm run db:deploy` | Миграции в prod |
| `npm run db:seed` | Seed администратора |

## Лицензия

Распространяется под лицензией [MIT](LICENSE).
