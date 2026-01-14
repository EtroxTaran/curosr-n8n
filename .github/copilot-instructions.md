# Copilot Instructions — AI Product Factory

Purpose: Give AI coding agents the minimal, actionable context needed to be productive in this repo.

## Big Picture

This repository contains the **AI Product Factory** - a multi-agent workflow system for generating Product Vision and Architecture documents. It includes:

1. **n8n Workflows**: Titan workflow suite (main orchestrator + subworkflows)
2. **Dashboard Frontend**: TanStack Start app for project management
3. **CI/CD Pipeline**: GitHub Actions + Dokploy for automated deployment

See `workflows/README.md` and `CLAUDE.md` for architecture diagrams and agent roles.

## Project Structure

```
curosr-n8n/
├── frontend/                    # TanStack Start dashboard application
│   ├── app/routes/             # File-based routing
│   ├── components/             # React components (Shadcn UI)
│   ├── lib/                    # Utilities (auth, db, s3, export)
│   └── types/                  # TypeScript types
├── workflows/                   # n8n workflow JSON files
├── scripts/                     # Utility scripts (sync-workflows.js)
├── .github/workflows/          # CI/CD pipeline
└── docker-compose.yml          # 11-service stack
```

## Key Files

### Workflows
- `workflows/titan-main-workflow.json` — main orchestrator
- `workflows/titan-adversarial-loop-subworkflow.json` — Creator→Critic→Refiner loop
- `workflows/titan-graphiti-subworkflow.json` — knowledge graph ops
- `workflows/titan-qdrant-subworkflow.json` — vector DB ops and embeddings

### Frontend
- `frontend/lib/auth.ts` — Better-Auth server config with Google OAuth
- `frontend/lib/auth-client.ts` — Client-side auth hooks
- `frontend/lib/db.ts` — PostgreSQL database operations
- `frontend/lib/s3.ts` — SeaweedFS/S3 integration
- `frontend/lib/export.ts` — ZIP export functionality

### CI/CD
- `.github/workflows/deploy.yml` — GitHub Actions workflow
- `scripts/sync-workflows.js` — n8n workflow sync script

### Documentation
- `README.md` — Project overview and quick start
- `CLAUDE.md` — MCP integration and detailed docs
- `workflows/README.md` — Workflow-specific documentation

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
- `OpenAI API` — main OpenAI credential for agents
- `OpenAI API Header` — HTTP header credential for embedding calls
- `OpenRouter API` — for Claude/GPT models via OpenRouter
- `Google Drive OAuth2` — document storage
- `Zep Api account` — agent memory

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
1. `titan-graphiti-subworkflow.json`
2. `titan-qdrant-subworkflow.json`
3. `titan-paper-trail-packager-subworkflow.json`
4. `titan-adversarial-loop-subworkflow.json`
5. `titan-main-workflow.json`

Activate subworkflows first; keep main workflow inactive during config changes.

## Common Pitfalls to Avoid

1. **Do not rename credentials** — workflows reference credentials by exact name
2. **Preserve `neverError` handling** — removing it causes silent failures
3. **Preserve Merge Output connections** — required for subworkflow returns
4. **Qdrant point IDs** — must remain UUIDv4 format
5. **Qdrant auth header** — use `api-key` header (not Authorization)
6. **Domain restriction** — ensure `ALLOWED_EMAIL_DOMAINS` is set for production

## Testing & Verification

- Use `workflows/TESTING_CHECKLIST.md` for step-by-step validation
- Run sample inputs via n8n UI Execute Workflow
- Confirm outputs: vision + architecture docs, iteration history, scores
- Test dashboard: `npm run dev` then visit http://localhost:3000

## When in Doubt

Consult `CLAUDE.md` for intended agent roles, expected timings, and MCP configuration examples. If making infra or secret-related changes, update `.env.example` and note sensitive values must remain out of git.
