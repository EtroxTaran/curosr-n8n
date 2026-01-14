# AI Product Factory

A sophisticated n8n-based AI orchestration system that automatically generates comprehensive **Product Vision** and **Architecture** documents through multi-phase, collaborative AI agent workflows.

![Version](https://img.shields.io/badge/version-2.5.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![n8n](https://img.shields.io/badge/n8n-v1.82+-orange)
![Node](https://img.shields.io/badge/node-20+-brightgreen)

## Overview

The AI Product Factory uses specialized AI agents working together to:

- Extract technical standards and decisions from existing documentation
- Create detailed Product Vision documents through iterative refinement
- Generate Architecture Vision documents (ARC42) with technical depth
- Validate and audit output quality through adversarial review
- Maintain knowledge graphs and vector embeddings for context retention

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Multi-Agent Collaboration** | 5+ specialized AI agents (Scavenger, Creator, Critic, Refiner, Auditor) |
| **Iterative Refinement** | Adversarial loops that improve output quality through multiple iterations |
| **Knowledge Management** | Integration with Graphiti (knowledge graph) and Qdrant (vector database) |
| **Document Intelligence** | Automatic extraction from Google Drive documents |
| **Quality Assurance** | Built-in validation and scoring mechanisms |
| **Human-in-the-Loop** | Governance approvals for tech standards |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Product Factory                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Traefik │  │   n8n   │  │Postgres │  │  Redis  │            │
│  │  Proxy  │  │Workflows│  │   DB    │  │  Cache  │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
│       │            │            │            │                  │
│  ┌────┴────────────┴────────────┴────────────┴────┐            │
│  │              Docker Network                     │            │
│  └────┬────────────┬────────────┬────────────┬────┘            │
│       │            │            │            │                  │
│  ┌────┴────┐  ┌────┴────┐  ┌────┴────┐  ┌────┴────┐            │
│  │ Qdrant  │  │Graphiti │  │SeaweedFS│  │Dashboard│            │
│  │ Vector  │  │Knowledge│  │   S3    │  │  React  │            │
│  │   DB    │  │  Graph  │  │ Storage │  │   App   │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Google Cloud account (for OAuth)
- OpenAI API key

### 1. Clone and Configure

```bash
git clone https://github.com/your-org/ai-product-factory.git
cd ai-product-factory

# Copy environment template
cp .env.example .env

# Edit with your values
nano .env
```

### 2. Configure Required Services

**Google OAuth** (for Dashboard authentication):
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID
3. Add redirect URI: `https://dashboard.your-domain.com/api/auth/callback/google`
4. Copy Client ID and Secret to `.env`

**n8n Credentials** (configure in n8n UI after startup):
- OpenAI API
- Google Drive OAuth2

### 3. Start Services

```bash
docker compose up -d
```

### 4. Access Applications

| Service | URL | Description |
|---------|-----|-------------|
| n8n | `https://your-domain.com` | Workflow orchestration |
| Dashboard | `https://dashboard.your-domain.com` | Project management UI |
| S3 Storage | `https://s3.your-domain.com` | Artifact storage |

## Project Structure

```
ai-product-factory/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline
├── frontend/                   # TanStack Start Dashboard
│   ├── app/
│   │   └── routes/            # File-based routing
│   ├── components/            # React components
│   │   ├── adr/              # ADR Viewer
│   │   ├── artifacts/        # Document viewer
│   │   ├── auth/             # Authentication
│   │   └── ui/               # Shadcn components
│   ├── lib/                   # Utilities
│   │   ├── auth.ts           # Better-Auth config
│   │   ├── db.ts             # PostgreSQL client
│   │   ├── s3.ts             # SeaweedFS client
│   │   └── export.ts         # ZIP export
│   └── Dockerfile
├── workflows/                  # n8n workflow definitions
│   ├── titan-main-workflow.json
│   ├── titan-adversarial-loop-subworkflow.json
│   ├── titan-graphiti-subworkflow.json
│   ├── titan-qdrant-subworkflow.json
│   └── ai-product-factory-*.json
├── scripts/
│   └── sync-workflows.js      # GitOps workflow sync
├── init-scripts/
│   └── 01-project-state.sql   # Database schema
├── docker-compose.yml          # Infrastructure
├── .env.example               # Environment template
└── CLAUDE.md                  # AI assistant guide
```

## Dashboard Features

### Project Overview
- Grid of project cards with status, phase, and last updated
- Quick access to all projects

### Project Detail
- **Artifacts Tab**: View and download generated documents (Markdown rendering)
- **ADRs Tab**: Browse Architecture Decision Records with filtering
- **Chat Tab**: Interactive chat interface for workflow interaction
- **History Tab**: Timeline of workflow iterations and decisions
- **Export**: Download all project artifacts as ZIP

### Authentication
- Google OAuth 2.0 with domain restriction
- Protected routes for all project pages

## Workflow Phases

| Phase | Duration | Description |
|-------|----------|-------------|
| **Phase 0: Scavenging** | 2-5 min | Extract tech standards from documents |
| **Phase 1: Vision Loop** | 5-15 min | Generate Product Vision (iterative) |
| **Phase 2: Architecture Loop** | 5-15 min | Generate Architecture Vision (iterative) |
| **Phase 3: Audit** | 1-3 min | Final quality validation |

**Total Duration**: 15-40 minutes per complete run

## CI/CD Pipeline

The project includes a GitHub Actions workflow that:

1. **Validates** code (lint + typecheck)
2. **Syncs workflows** to n8n via API
3. **Triggers deployment** via Dokploy webhook
4. **Runs health checks** post-deployment

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `N8N_API_URL` | n8n instance URL |
| `N8N_API_KEY` | n8n API key |
| `DOKPLOY_WEBHOOK_URL` | Dokploy deploy webhook (optional) |
| `DASHBOARD_URL` | Dashboard URL for health checks (optional) |

### Manual Workflow Sync

```bash
# Preview changes
npm run sync-workflows:dry-run

# Apply changes
npm run sync-workflows
```

## Environment Variables

See [.env.example](.env.example) for all required variables. Key sections:

- **PostgreSQL**: Database credentials
- **n8n**: Encryption key, domain, timezone
- **Traefik/SSL**: ACME email for Let's Encrypt
- **Vector DB**: Qdrant API key
- **Knowledge Graph**: OpenAI API key for Graphiti
- **S3 Storage**: SeaweedFS credentials
- **Dashboard Auth**: Google OAuth credentials
- **Models**: OpenRouter model selection

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Complete integration guide for AI assistants |
| [workflows/README.md](workflows/README.md) | Workflow overview and setup |
| [workflows/WORKFLOW_DOCUMENTATION.md](workflows/WORKFLOW_DOCUMENTATION.md) | Detailed workflow reference |
| [workflows/TITAN_AGENT_PROMPTS.md](workflows/TITAN_AGENT_PROMPTS.md) | AI agent system prompts |
| [workflows/TESTING_CHECKLIST.md](workflows/TESTING_CHECKLIST.md) | QA procedures and test cases |

## Development

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## API Endpoints

### Dashboard API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/auth/*` | GET/POST | Authentication routes |

### n8n Webhooks

| Workflow | Trigger | Description |
|----------|---------|-------------|
| Titan Main | Chat | Start document generation |
| Smart Start | Chat | Resume or start project |

## Cost Optimization

The system includes several cost optimizations:

- **Model Selection**: GPT-4o-mini for extraction, Claude for reasoning
- **Prompt Caching**: Up to 90% savings on repeated prompts
- **Iteration Limits**: Configurable max iterations
- **Quality Thresholds**: Adjustable score targets

**Estimated Cost**: ~$0.10 per full workflow run (optimized)

## Troubleshooting

### Common Issues

**MCP Connection Failed**
- Verify n8n instance is accessible
- Check API key hasn't expired
- Ensure MCP is enabled in n8n settings

**Workflow Not Found**
- Mark workflows as "Available in MCP" in n8n
- Restart Claude Code after config changes

**Authentication Failed**
- Verify Google OAuth credentials
- Check redirect URIs match exactly
- Ensure allowed domains include your email domain

See [n8n-mcp-diagnosis.md](n8n-mcp-diagnosis.md) for detailed troubleshooting.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and test thoroughly
4. Update documentation
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- [Documentation](workflows/README.md)
- [Issues](https://github.com/your-org/ai-product-factory/issues)
- [n8n Community](https://community.n8n.io)
