#!/bin/sh
# SeaweedFS S3 Authentication Entrypoint
# Generates S3 config from environment variables at runtime

set -e

# Create config directory if it doesn't exist
mkdir -p /etc/seaweedfs

# Generate S3 config with authentication
cat > /etc/seaweedfs/s3.json << EOF
{
  "identities": [
    {
      "name": "admin",
      "credentials": [
        {
          "accessKey": "${S3_ACCESS_KEY:-admin}",
          "secretKey": "${S3_SECRET_KEY:-admin_secret}"
        }
      ],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    }
  ]
}
EOF

echo "SeaweedFS S3 authentication configured with access key: ${S3_ACCESS_KEY:-admin}"

# Use container hostname or default to localhost for standalone mode
# In Docker Compose, set SEAWEED_IP to the service name (e.g., "seaweedfs")
SEAWEED_IP="${SEAWEED_IP:-localhost}"

# Start SeaweedFS with S3 authentication enabled
# Port layout:
#   - S3 API: 8333 (for S3 client connections)
#   - Filer:  8888 (for file operations)
#   - Master: 9333 (internal)
exec weed server \
  -s3 \
  -s3.config=/etc/seaweedfs/s3.json \
  -s3.port=8333 \
  -dir=/data \
  -ip="$SEAWEED_IP" \
  -ip.bind=0.0.0.0 \
  -filer.port=8888 \
  "$@"
