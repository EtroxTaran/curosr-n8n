# Copilot Instructions — AI Product Factory v3.0.2

Purpose: Give AI coding agents the minimal, actionable context needed to be productive in this repo.

## Big Picture

This repository contains the **AI Product Factory** - a multi-agent workflow system for generating Product Vision and Architecture documents. It includes:

1. **n8n Workflows**: AI Product Factory workflow suite (8 workflows)
2. **Dashboard Frontend**: TanStack Start app with Setup Wizard
3. **CI/CD Pipeline**: GitHub Actions + Dokploy for automated deployment
4. **Integration Tests**: 79 integration tests + 421+ total tests

See `EXPERT_CONTEXT.md` for comprehensive documentation, `CLAUDE.md` for MCP integration.

## Project Structure

```
n8n-AI-Product-Factory/
├── frontend/                    # TanStack Start dashboard application
│   ├── app/routes/             # File-based routing
│   ├── components/             # React components (Shadcn UI)
│   ├── lib/                    # Utilities (auth, db, s3, encryption)
│   └── tests/                  # Frontend tests
├── tests/                       # Backend tests
│   ├── integration/            # Integration tests (79 tests)
│   ├── helpers/                # Test utilities
│   └── mocks/                  # Mock servers
├── workflows/                   # n8n workflow JSON files
├── scripts/                     # Utility scripts
├── .github/workflows/          # CI/CD pipeline
└── docker-compose.*.yml        # Docker configurations
```

## Key Files

### Workflows (8 total)
- `workflows/ai-product-factory-main-workflow.json` — main orchestrator
- `workflows/ai-product-factory-api-workflow.json` — API webhooks
- `workflows/ai-product-factory-scavenging-subworkflow.json` — Phase 0
- `workflows/ai-product-factory-vision-loop-subworkflow.json` — Phase 1
- `workflows/ai-product-factory-architecture-loop-subworkflow.json` — Phase 2
- `workflows/ai-product-factory-s3-subworkflow.json` — S3 operations
- `workflows/titan-graphiti-subworkflow.json` — knowledge graph ops
- `workflows/titan-qdrant-subworkflow.json` — vector DB ops

### Frontend
- `frontend/lib/auth.ts` — Better-Auth with Google OAuth
- `frontend/lib/settings.ts` — App settings CRUD
- `frontend/lib/encryption.ts` — AES-256-GCM encryption
- `frontend/lib/n8n-api.ts` — n8n REST API client
- `frontend/lib/s3.ts` — SeaweedFS/S3 integration

### CI/CD
- `.github/workflows/deploy.yml` — GitHub Actions workflow
- `scripts/sync-workflows.js` — n8n workflow sync script

### Documentation
- `EXPERT_CONTEXT.md` — Comprehensive system documentation
- `CLAUDE.md` — MCP integration and detailed guide
- `workflows/WORKFLOW_DOCUMENTATION.md` — Workflow reference

## Primary Patterns

### Adversarial Loop
Creator → Critic → Refiner pattern with iteration history and score threshold (stop when score ≥ 9.0 or max iterations reached).

### Subworkflow Outputs
All subworkflows must return outputs via Merge Output nodes — prior versions had dead-end nodes.

### Error Handling
External HTTP nodes use `neverError` mode with central validation nodes; preserve this pattern when editing flows.

### Authentication
Better-Auth with Google OAuth. Domain restriction via `ALLOWED_EMAIL_DOMAINS` env var. Check `frontend/lib/auth.ts` for implementation.

## Credentials & Naming Conventions

Must match n8n exactly:
- `OpenRouter API` — for Claude/GPT models via OpenRouter
- `OpenAI API Header` — HTTP header credential for embedding calls
- `Zep Api account` — agent memory

Note: S3 storage uses environment variables, not credentials.

## Environment Variables

Key variables (see `.env.example` for full list):
- `GRAPHITI_URL`, `QDRANT_URL`, `QDRANT_API_KEY` — infrastructure
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` — OAuth
- `ALLOWED_EMAIL_DOMAINS` — domain restriction
- `N8N_API_URL`, `N8N_API_KEY` — workflow sync

## Developer Workflows

### Running the Dashboard
```bash
cd frontend && npm install && npm run dev
```

### Syncing Workflows
```bash
# Dry run (preview changes)
npm run sync-workflows:dry-run

# Apply changes
npm run sync-workflows
```

### Import Order for n8n Workflows
1. `ai-product-factory-s3-subworkflow.json` — S3 operations (dependency)
2. `ai-product-factory-decision-logger-subworkflow.json` — logging (dependency)
3. `pf-perplexity-research.json` — research tool
4. `ai-product-factory-scavenging-subworkflow.json` — Phase 0
5. `ai-product-factory-vision-loop-subworkflow.json` — Phase 1
6. `ai-product-factory-architecture-loop-subworkflow.json` — Phase 2
7. `ai-product-factory-api-workflow.json` — API webhooks
8. `ai-product-factory-main-workflow.json` — main orchestrator

Activate subworkflows first; keep main workflow inactive during config changes.

## Common Pitfalls to Avoid

1. **Do not rename credentials** — workflows reference credentials by exact name
2. **Preserve `neverError` handling** — removing it causes silent failures
3. **Preserve Merge Output connections** — required for subworkflow returns
4. **Qdrant point IDs** — must remain UUIDv4 format
5. **Qdrant auth header** — use `api-key` header (not Authorization)
6. **Domain restriction** — ensure `ALLOWED_EMAIL_DOMAINS` is set for production

## Testing & Verification

- Run integration tests: `npm run test:integration`
- Run sample inputs via n8n UI Execute Workflow
- Confirm outputs: vision + architecture docs, iteration history, scores
- Test dashboard: `npm run dev` then visit http://localhost:3000

## When in Doubt

Consult `CLAUDE.md` for intended agent roles, expected timings, and MCP configuration examples. If making infra or secret-related changes, update `.env.example` and note sensitive values must remain out of git.
