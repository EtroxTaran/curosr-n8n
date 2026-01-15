# AI Product Factory - Dokploy Deployment Guide

This guide explains how to deploy the AI Product Factory on [Dokploy](https://dokploy.com/).

## Prerequisites

1. **Dokploy Instance**: A running Dokploy server
2. **Domain Names**: Three subdomains configured:
   - `n8n.yourdomain.com` - Workflow engine
   - `dashboard.yourdomain.com` - Frontend dashboard
   - `s3.yourdomain.com` - S3 storage endpoint
3. **API Keys**:
   - OpenAI API key (for embeddings and knowledge graph)
   - Google OAuth credentials (for dashboard authentication)

## Quick Start

### Step 1: Create Project in Dokploy

1. Log into your Dokploy dashboard
2. Click **Projects** → **Create Project**
3. Name it `ai-product-factory`

### Step 2: Create Compose Service

1. Inside your project, click **Create Service** → **Compose**
2. Choose **GitHub** as source type
3. Connect your repository: `your-username/n8n-AI-Product-Factory`
4. Set the compose file path: `docker-compose.dokploy.yml`
5. Set branch: `main`

### Step 3: Configure Environment Variables

In the service's **Environment** tab, add these variables:

```bash
# Domains (match your DNS records)
N8N_DOMAIN=n8n.yourdomain.com
DASHBOARD_DOMAIN=dashboard.yourdomain.com
S3_DOMAIN=s3.yourdomain.com

# Database (generate strong passwords!)
POSTGRES_USER=n8n
POSTGRES_PASSWORD=<generate: openssl rand -base64 32>
POSTGRES_DB=n8n

# n8n Encryption (generate unique key!)
N8N_ENCRYPTION_KEY=<generate: openssl rand -hex 16>

# Timezone
TIMEZONE=Europe/Berlin

# OpenAI (for knowledge graph)
OPENAI_API_KEY=sk-...

# S3 Storage Credentials (generate unique keys!)
S3_ACCESS_KEY=<generate: openssl rand -hex 8>
S3_SECRET_KEY=<generate: openssl rand -hex 16>
S3_BUCKET=product-factory-artifacts

# Google OAuth
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
AUTH_SECRET=<generate: openssl rand -hex 32>
ALLOWED_EMAIL_DOMAINS=yourdomain.com

# AI Configuration (optional, uses defaults)
FACTORY_MAX_ITERATIONS=5
FACTORY_SCORE_THRESHOLD=90

# Models (optional, uses defaults)
MODEL_ARCHITECT=anthropic/claude-sonnet-3.5
MODEL_CRITIC=openai/gpt-4o
```

### Step 4: Configure Domains in Dokploy

For each exposed service, configure a domain in Dokploy:

| Service | Port | Domain |
|---------|------|--------|
| n8n | 5678 | n8n.yourdomain.com |
| dashboard | 3000 | dashboard.yourdomain.com |
| seaweedfs | 8888 | s3.yourdomain.com |

**For each domain:**
1. Go to **Domains** tab in the service
2. Click **Add Domain**
3. Enter the domain name
4. Enable **HTTPS** (Let's Encrypt)
5. Select the correct container and port

### Step 5: Deploy

1. Click **Deploy** to start the deployment
2. Monitor logs in the **Logs** tab
3. Wait for all containers to become healthy (2-5 minutes)

### Step 6: Post-Deployment Setup

#### Initialize S3 Bucket

The bucket needs to be created on first run. SSH into your server or use Dokploy's terminal:

```bash
# Create the artifacts bucket
docker exec ai-product-factory-seaweedfs-1 \
  /usr/bin/weed shell -master=localhost:9333 \
  -filer=localhost:8333 \
  "s3.bucket.create -name product-factory-artifacts"
```

#### Sync n8n Workflows

From your local machine with the repo cloned:

```bash
cd n8n-AI-Product-Factory

# Set environment variables
export N8N_API_URL=https://n8n.yourdomain.com
export N8N_API_KEY=<your-n8n-api-key>

# Dry run first
npm run sync-workflows:dry-run

# Apply workflows
npm run sync-workflows
```

Or configure automatic sync via GitHub Actions (see CI/CD section below).

#### Configure Google OAuth Redirect

In Google Cloud Console, add authorized redirect URI:
```
https://dashboard.yourdomain.com/api/auth/callback/google
```

## CI/CD Integration

### GitHub Actions Webhook

1. In Dokploy, go to your service → **Settings** → **Webhook**
2. Copy the webhook URL
3. In GitHub, add repository secret: `DOKPLOY_WEBHOOK_URL`

The existing `.github/workflows/deploy.yml` will automatically:
- Validate code on push
- Sync n8n workflows
- Trigger Dokploy deployment
- Run health checks

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `DOKPLOY_WEBHOOK_URL` | Dokploy deployment webhook |
| `N8N_API_URL` | e.g., `https://n8n.yourdomain.com` |
| `N8N_API_KEY` | n8n API key (generate in n8n settings) |
| `DASHBOARD_URL` | e.g., `https://dashboard.yourdomain.com` |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      DOKPLOY SERVER                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Dokploy Traefik Proxy                │    │
│  │  (Handles SSL, routing to containers)               │    │
│  └─────────────────────────────────────────────────────┘    │
│          │                    │                    │        │
│          ▼                    ▼                    ▼        │
│   n8n.domain.com      dashboard.domain.com   s3.domain.com  │
│          │                    │                    │        │
│          ▼                    ▼                    ▼        │
│  ┌───────────┐        ┌───────────┐        ┌───────────┐    │
│  │    n8n    │        │ Dashboard │        │ SeaweedFS │    │
│  │  :5678    │        │   :3000   │        │   :8888   │    │
│  └───────────┘        └───────────┘        └───────────┘    │
│          │                    │                    │        │
│          └────────────┬───────┴────────────────────┘        │
│                       │                                     │
│               ┌───────┴───────┐                             │
│               │  n8n_network  │                             │
│               └───────┬───────┘                             │
│          ┌────────────┼────────────┐                        │
│          ▼            ▼            ▼                        │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│    │ Postgres │ │  Qdrant  │ │ Graphiti │                  │
│    │  :5432   │ │  :6333   │ │  :8080   │                  │
│    └──────────┘ └──────────┘ └──────────┘                  │
│          │                         │                        │
│          ▼                         ▼                        │
│    ┌──────────┐             ┌──────────┐                   │
│    │  Redis   │             │ FalkorDB │                   │
│    │  :6379   │             │  :6379   │                   │
│    └──────────┘             └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Resource Requirements

Minimum recommended resources for your Dokploy server:

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Storage | 50 GB SSD | 100 GB SSD |

Individual service estimates:
- **n8n**: 1-2 GB RAM, 1 CPU
- **PostgreSQL**: 512 MB - 1 GB RAM
- **Qdrant**: 1-2 GB RAM (depends on vector count)
- **Graphiti + FalkorDB**: 1-2 GB RAM
- **SeaweedFS**: 512 MB RAM + storage for files
- **Dashboard**: 256-512 MB RAM

## Troubleshooting

### Services Not Starting

**Check logs:**
```bash
docker logs ai-product-factory-n8n-1
docker logs ai-product-factory-dashboard-1
```

**Common issues:**
- Missing environment variables → Check Dokploy env settings
- Database connection failed → Ensure postgres is healthy first
- Port conflicts → Check no other services use 5678, 3000, 8888

### Health Checks Failing

**n8n health check:**
```bash
curl https://n8n.yourdomain.com/healthz
```

**Dashboard health check:**
```bash
curl https://dashboard.yourdomain.com/api/health
```

### PostgreSQL Version Mismatch

**Error:**
```
FATAL: database files are incompatible with server
DETAIL: The data directory was initialized by PostgreSQL version 16, but this is version 18
```

**Cause:** PostgreSQL major versions have incompatible data formats. PostgreSQL 18+ uses a different PGDATA path: `/var/lib/postgresql/18/docker`.

**Solution:**
1. Update the volume mount in docker-compose.dokploy.yml:
   ```yaml
   postgres:
     image: postgres:18-alpine
     volumes:
       # PostgreSQL 18+ uses /var/lib/postgresql (not /var/lib/postgresql/data)
       - postgres18_data:/var/lib/postgresql
   ```

2. Rename the volume to create fresh database:
   ```yaml
   volumes:
     postgres18_data:  # New name forces fresh initialization
   ```

### npm ci Package Lock Mismatch

**Error:**
```
npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync.
```

**Solution:**
1. Regenerate lock file locally:
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   ```
2. Commit and push both files:
   ```bash
   git add package.json package-lock.json
   git commit -m "fix: Sync package-lock.json"
   git push
   ```

### Module Not Found in Container

**Error:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@tanstack/history'
```

**Cause:** Dockerfile runner stage doesn't install production dependencies.

**Fix:** Ensure runner stage includes dependency installation:
```dockerfile
FROM node:22-alpine AS runner
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
RUN npm ci --omit=dev
```

### Port Already Allocated

**Error:**
```
Bind for 0.0.0.0:3000 failed: port is already allocated
```

**Cause:** Explicit port mappings conflict with Traefik routing.

**Solution:** Remove all port mappings from docker-compose.dokploy.yml:
```yaml
dashboard:
  # ports removed - Traefik handles routing via domains
  networks:
    - n8n_network
```

### SeaweedFS Connection Errors

**Warning:**
```
meta_aggregator.go:98] failed to subscribe remote meta change: connection refused
```

**Cause:** Filer component enabled but not needed for S3-only mode.

**Solution:** Disable filer with `-filer=false`:
```yaml
seaweedfs:
  command: "server -s3 -dir=/data -ip=seaweedfs -s3.port=8888 -filer=false"
```

### Redis/FalkorDB Memory Warnings

**Warning:**
```
WARNING Memory overcommit must be enabled!
```

**Cause:** Host kernel setting, cannot fix in Docker Compose.

**Solution (requires SSH access):**
```bash
# Temporary
sudo sysctl vm.overcommit_memory=1

# Permanent
echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### S3 Upload Issues

**Test S3 connectivity:**
```bash
# From dashboard container
curl http://seaweedfs:8888/
```

**Check bucket exists:**
```bash
docker exec ai-product-factory-seaweedfs-1 \
  /usr/bin/weed shell -master=localhost:9333 "s3.bucket.list"
```

### Google OAuth Not Working

**Correct redirect URI pattern:**
```
https://dashboard.yourdomain.com/api/auth/callback/google
```

**Checklist:**
1. Verify `AUTH_URL` matches your dashboard domain exactly
2. Add redirect URI to Google Cloud Console → Credentials → OAuth 2.0 Client
3. Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
4. Wait 5-10 minutes for Google's OAuth config to propagate

### Fresh Deployment (Volume Reset)

To start fresh without manual volume deletion:

1. Rename all volumes in docker-compose.dokploy.yml:
   ```yaml
   volumes:
     n8n_data_v2:
     postgres18_data:
     redis_data_v2:
     qdrant_data_v2:
     falkordb_data_v2:
     seaweedfs_data_v2:
   ```

2. Update all service volume mounts to use new names

3. Redeploy - old orphaned volumes will be cleaned up automatically

### Workflow Sync Failing

```bash
# Test API connectivity
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://n8n.yourdomain.com/api/v1/workflows

# Check sync script
N8N_API_URL=https://n8n.yourdomain.com \
N8N_API_KEY=your-key \
node scripts/sync-workflows.js --dry-run --verbose
```

### n8n Python Task Runner Warning

**Warning:**
```
Failed to start Python task runner in internal mode.
```

**Impact:** Non-critical. Only affects Python-based n8n nodes (not used by AI Product Factory).

**Action:** Safe to ignore unless you need Python nodes.

## Updating

### Code Updates

Push to `main` branch → GitHub Actions automatically:
1. Validates code
2. Syncs workflows to n8n
3. Triggers Dokploy redeploy

### Manual Redeploy

In Dokploy dashboard:
1. Go to your service
2. Click **Redeploy**

### Database Migrations

New migrations in `init-scripts/` only run on fresh PostgreSQL containers.

For existing deployments, run manually:
```bash
docker exec -i ai-product-factory-postgres-1 \
  psql -U n8n -d n8n < init-scripts/02-add-input-files.sql
```

## Backup & Restore

### Backup PostgreSQL

```bash
docker exec ai-product-factory-postgres-1 \
  pg_dump -U n8n n8n > backup_$(date +%Y%m%d).sql
```

### Backup Volumes

Dokploy stores volumes in `/var/lib/docker/volumes/`. Back up:
- `ai-product-factory_postgres18_data`
- `ai-product-factory_n8n_data_v2`
- `ai-product-factory_redis_data_v2`
- `ai-product-factory_qdrant_data_v2`
- `ai-product-factory_falkordb_data_v2`
- `ai-product-factory_seaweedfs_data_v2`

### Restore

```bash
# Restore PostgreSQL
docker exec -i ai-product-factory-postgres-1 \
  psql -U n8n n8n < backup_20260114.sql
```

## Security Notes

1. **Change all default passwords** before deployment
2. **Restrict allowed email domains** for OAuth
3. **Keep API keys in Dokploy's encrypted env**, not in code
4. **Enable Dokploy's firewall** rules if available
5. **Regular backups** - automate with cron

## Support

- Dokploy docs: https://docs.dokploy.com/
- n8n docs: https://docs.n8n.io/
- Project issues: Check the repo's GitHub Issues
