#!/bin/sh
set -e

echo "[entrypoint] applying Payload migrations..."
node node_modules/payload/bin.js migrate

echo "[entrypoint] migrations up to date, starting app..."
exec "$@"
