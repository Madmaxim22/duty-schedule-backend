#!/bin/sh
# Создать .htpasswd для duty-docs (Basic Auth nginx).
# Запуск на NAS: cd docker/docs && sh scripts/generate-htpasswd.sh

set -e
cd "$(dirname "$0")/.."

if [ -f .htpasswd ] && [ "$1" != "--force" ]; then
  echo ".htpasswd already exists. Use: sh scripts/generate-htpasswd.sh --force"
  exit 0
fi

printf "Username (e.g. email): "
read -r USER
printf "Password: "
stty -echo
read -r PASS
stty echo
printf "\n"

docker run --rm httpd:alpine htpasswd -nbB "$USER" "$PASS" > .htpasswd
chmod 600 .htpasswd
echo "Created $(pwd)/.htpasswd"
echo "Restart: docker compose up -d --force-recreate"
