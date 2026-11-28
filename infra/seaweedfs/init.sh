#!/bin/sh
# Одноразово створює bucket-и (ідемпотентно: наявні не чіпає).
set -eu
for bucket in "$S3_BUCKET_QUARANTINE" "$S3_BUCKET_MEDIA"; do
  echo "s3.bucket.create -name $bucket" | weed shell -master=seaweedfs:9333 -filer=seaweedfs:8888 || true
done
echo "Buckets are ready"
