# DNS для duty-w.ru

[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://madmaxim22.github.io/duty-schedule/)

Настраивается **у регистратора домена** (не в репозитории).

## Записи

| Тип | Имя | Значение | TTL |
|-----|-----|----------|-----|
| A | `@` | Публичный IP NAS | 300–3600 |
| A или CNAME | `www` | Тот же IP или `duty-w.ru` | 300–3600 |

## Проверка

```bash
nslookup duty-w.ru
# или на NAS:
./scripts/verify-https.sh duty-w.ru
```

Пока DNS не указывает на NAS, Let's Encrypt в NPM не выпустит сертификат.

## После настройки DNS

1. Роутер: 80, 443 → NAS; убрать проброс 8080.
2. NPM + Proxy Host + LE — см. [README.md](../../README.md).
3. `.env`: `CORS_ORIGIN=https://duty-w.ru`, `COOKIE_SECURE=true`.
