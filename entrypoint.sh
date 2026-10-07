#!/bin/sh
# Entrypoint: tạo thư mục data + proxies.json mặc định trước khi start
set -e

mkdir -p /app/data/cookies

# Khởi tạo proxies.json rỗng nếu chưa có
if [ ! -f /app/data/proxies.json ]; then
  echo '[]' > /app/data/proxies.json
fi

exec "$@"
