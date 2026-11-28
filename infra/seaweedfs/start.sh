#!/bin/sh
# Запуск SeaweedFS з S3-шлюзом. Конфіг доступу генерується з env у tmpfs (у файлі на диску
# секретів немає):
#  - api: читання/запис лише у двох bucket-ах, без листингу й адмін-дій;
#  - anonymous: ЛИШЕ читання bucket-а media (його віддає Nginx), без листингу.
set -eu
umask 077
cat > /tmp/s3.json <<JSON
{
  "identities": [
    {
      "name": "api",
      "credentials": [{ "accessKey": "$S3_ACCESS_KEY_ID", "secretKey": "$S3_SECRET_ACCESS_KEY" }],
      "actions": [
        "Read:$S3_BUCKET_QUARANTINE", "Write:$S3_BUCKET_QUARANTINE",
        "Read:$S3_BUCKET_MEDIA", "Write:$S3_BUCKET_MEDIA"
      ]
    },
    { "name": "anonymous", "actions": ["Read:$S3_BUCKET_MEDIA"] }
  ]
}
JSON
# -ip: адреса, яку master роздає іншим компонентам (ім'я сервісу в мережі compose);
# -ip.bind=0.0.0.0: інакше сервер слухає лише IP контейнера, і healthcheck на 127.0.0.1 не проходить.
exec weed server -ip=seaweedfs -ip.bind=0.0.0.0 -dir=/data \
  -s3 -s3.port=8333 -s3.config=/tmp/s3.json
