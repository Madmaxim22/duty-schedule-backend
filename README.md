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

Файл `.env` **не коммитьте** в git.

### Web Push (оповещение админа о заявках)

1. Сгенерируйте ключи: `npx web-push generate-vapid-keys` → добавьте в `.env`.
2. Миграция: `npx prisma migrate deploy`.
3. На frontend админ включает уведомления на `/admin/users`.

При `POST /auth/register` push уходит всем подписанным пользователям с `role=admin` и `status=approved`. Без VAPID регистрация не ломается.

Подробнее: [корневой README — Web Push](../README.md#web-push-для-администратора).

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

### Web Push

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| GET | `/push/vapid-public-key` | публичный | Публичный VAPID (503 без ключей) |
| POST | `/push/subscribe` | admin | Сохранить подписку |
| DELETE | `/push/subscribe` | admin | `{ "endpoint" }` — отписаться |

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

**Импорт:** `title` в `info` — последние 2 цифры = номер кабинета (`131` → каб. `31`, секция B). Таблицы: `user_absences`, `duty_assignment_changes`.

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
