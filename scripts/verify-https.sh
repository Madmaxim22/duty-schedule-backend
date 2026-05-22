#!/bin/sh
# Проверка Duty и HTTPS (запуск на NAS по SSH).
# Использование: ./scripts/verify-https.sh [домен]
# Пример: ./scripts/verify-https.sh duty-w.ru

set -e
DOMAIN="${1:-duty-w.ru}"

echo "=== DNS ==="
if command -v nslookup >/dev/null 2>&1; then
  nslookup "$DOMAIN" || true
else
  getent hosts "$DOMAIN" || true
fi

echo ""
echo "=== Duty (localhost) ==="
curl -sf "http://127.0.0.1:8080/api/health" && echo " OK (8080)" || echo " FAIL: Duty не отвечает на 127.0.0.1:8080"

echo ""
echo "=== HTTPS (через NPM) ==="
if curl -sf "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
  echo " OK https://${DOMAIN}/api/health"
else
  echo " SKIP или FAIL: https://${DOMAIN} (DNS, NPM, LE или firewall)"
fi

echo ""
echo "=== HTTP redirect ==="
curl -sI "http://${DOMAIN}" 2>/dev/null | head -n 5 || echo " SKIP http://${DOMAIN}"
