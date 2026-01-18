# AI Product Factory - Expert Context Document

**Version:** 3.0.2
**Date:** 2026-01-18
**Purpose:** Comprehensive technical reference for expert consultation and system improvement analysis

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [System Architecture](#3-system-architecture)
4. [Complete Tech Stack](#4-complete-tech-stack)
5. [AI Agent System](#5-ai-agent-system)
6. [Workflow Phases](#6-workflow-phases)
7. [Dashboard Application](#7-dashboard-application)
8. [Data Architecture](#8-data-architecture)
9. [API Reference](#9-api-reference)
10. [Infrastructure & Deployment](#10-infrastructure--deployment)
11. [Testing Strategy](#11-testing-strategy)
12. [Current Limitations & Known Issues](#12-current-limitations--known-issues)
13. [Improvement Opportunities](#13-improvement-opportunities)

---

## 1. Executive Summary

The **AI Product Factory** is an n8n-based multi-agent AI orchestration system that automatically generates professional Product Vision and Architecture documents through collaborative AI workflows. It implements human-in-the-loop governance, adversarial quality loops, and maintains knowledge context through graph and vector databases.

### Core Value Proposition

| Problem | Solution |
|---------|----------|
| Product documentation is time-consuming and inconsistent | Automated generation with quality validation |
| Technical decisions lack traceability | Decision logs with complete audit trail |
| AI outputs lack quality control | Adversarial loops with scoring thresholds |
| Knowledge is siloed in documents | Knowledge graph + vector embeddings |
| No human oversight of AI decisions | Batch governance UI for tech stack approval |

### Key Metrics

| Metric | Value |
|--------|-------|
| **Workflow Duration** | 15-40 minutes per project |
| **Quality Threshold** | Score >= 90/100 |
| **Max Iterations** | 5 per phase |
| **Cost Per Run** | ~$0.10-0.15 (optimized) |
| **AI Agents** | 8 specialized agents |
| **Test Coverage** | 79 integration tests, 421+ total tests |

---

## 2. Product Vision

### Mission Statement

Enable organizations to rapidly generate high-quality, validated product and architecture documentation using collaborative AI agents with human oversight.

### Target Users

1. **Product Managers** - Need structured Product Vision documents
2. **Solution Architects** - Require comprehensive architecture documentation (ARC42)
3. **Tech Leads** - Want validated technical decisions with audit trails
4. **Startups** - Need professional documentation quickly
5. **Consultants** - Require repeatable documentation workflows

### Key Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Multi-Agent Collaboration** | 8 specialized AI agents working together | ✅ Complete |
| **Adversarial Quality Loops** | Creator → Critic → Refiner iteration | ✅ Complete |
| **Human-in-the-Loop Governance** | Tech Stack Configurator widget | ✅ Complete |
| **Knowledge Management** | Graphiti (graph) + Qdrant (vector) | ✅ Complete |
| **S3-Compatible Storage** | SeaweedFS for documents and artifacts | ✅ Complete |
| **Drag-and-Drop Upload** | Presigned URL file upload | ✅ Complete |
| **ADR Viewer** | Architecture Decision Record browser | ✅ Complete |
| **Project Dashboard** | TanStack Start React application | ✅ Complete |
| **Setup Wizard** | 6-step n8n configuration wizard | ✅ Complete |
| **CI/CD Pipeline** | GitHub Actions + Dokploy | ✅ Complete |
| **State Resumability** | Smart Start for interrupted workflows | ✅ Complete |

### Output Artifacts

| Artifact | Format | Description |
|----------|--------|-------------|
| **Product Vision** | Markdown | Problem, personas, JTBD, metrics, differentiation |
| **Architecture Vision** | Markdown | ARC42 template (12 sections) |
| **Decision Log** | Markdown | ADRs and iteration history |
| **Tech Standards** | JSON | Approved global/local standards |

---

## 3. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI PRODUCT FACTORY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Traefik   │    │     n8n     │    │  PostgreSQL │    │    Redis    │  │
│  │   Reverse   │◄───│  Workflow   │◄───│   Database  │    │    Cache    │  │
│  │    Proxy    │    │   Engine    │    │             │    │             │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │          │
│  ┌──────┴──────────────────┴──────────────────┴──────────────────┴──────┐  │
│  │                         Docker Network                                │  │
│  └──────┬──────────────────┬──────────────────┬──────────────────┬──────┘  │
│         │                  │                  │                  │          │
│  ┌──────┴──────┐    ┌──────┴──────┐    ┌──────┴──────┐    ┌──────┴──────┐  │
│  │   Qdrant    │    │  Graphiti   │    │  SeaweedFS  │    │  Dashboard  │  │
│  │   Vector    │    │  Knowledge  │    │     S3      │    │   React     │  │
│  │     DB      │    │    Graph    │    │   Storage   │    │    App      │  │
│  └─────────────┘    └──────┬──────┘    └─────────────┘    └─────────────┘  │
│                            │                                                 │
│                     ┌──────┴──────┐                                         │
│                     │  FalkorDB   │                                         │
│                     │   (Graph    │                                         │
│                     │   Backend)  │                                         │
│                     └─────────────┘                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workflow Orchestration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORKFLOW EXECUTION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐           │
│  │   User      │         │  Dashboard  │         │   n8n API   │           │
│  │  Upload     │────────►│  /start-    │────────►│  Webhook    │           │
│  │  Files      │         │  project    │         │  Trigger    │           │
│  └─────────────┘         └─────────────┘         └──────┬──────┘           │
│                                                         │                   │
│                                                         ▼                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      PHASE 0: CONTEXT SCAVENGING                      │  │
│  │  • Scan S3 input files                                                │  │
│  │  • Extract tech standards (Scavenger Agent)                          │  │
│  │  • Present Governance UI → Human approval                            │  │
│  │  • Store approved standards in Graphiti + Qdrant                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     PHASE 1: VISION LOOP                              │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐                        │  │
│  │  │Visionary │───►│  Critic  │───►│ Refiner  │◄──────┐               │  │
│  │  │(Claude)  │    │(GPT-4o)  │    │(Claude)  │       │               │  │
│  │  └──────────┘    └────┬─────┘    └──────────┘       │               │  │
│  │                       │                              │               │  │
│  │                  Score < 90? ──────────────────────►│               │  │
│  │                  Score >= 90? → SUCCESS                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   PHASE 2: ARCHITECTURE LOOP                          │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐       │  │
│  │  │Architect │───►│ Dr. Doom │───►│  Fixer   │───►│ Refiner  │       │  │
│  │  │(Claude)  │    │(GPT-4o)  │    │(Perplexi)│    │(Claude)  │       │  │
│  │  └──────────┘    └──────────┘    └──────────┘    └────┬─────┘       │  │
│  │                                                        │             │  │
│  │                                   Score < 90? ◄────────┘             │  │
│  │                                   Score >= 90? → SUCCESS              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        FINALIZATION                                   │  │
│  │  • Save final artifacts to S3                                        │  │
│  │  • Update project_state in PostgreSQL                                │  │
│  │  • Generate decision log                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Complete Tech Stack

### Core Infrastructure

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| **Workflow Engine** | n8n | v1.82+ | Orchestration, AI agents, webhooks |
| **Database** | PostgreSQL | 18 | Project state, settings, decision logs |
| **Cache** | Redis | 7.4 | Session cache, rate limiting |
| **Reverse Proxy** | Traefik | v3.6 | SSL, routing, load balancing |
| **Object Storage** | SeaweedFS | latest | S3-compatible artifact storage |

### AI & Knowledge Services

| Component | Technology | Model/Version | Purpose |
|-----------|------------|---------------|---------|
| **LLM Provider** | OpenRouter | - | API gateway for Claude/GPT-4o |
| **Primary Model** | Claude Sonnet 3.5 | anthropic/claude-sonnet-3.5 | Creative agents (Visionary, Architect, Refiner) |
| **Critic Model** | GPT-4o | openai/gpt-4o | Analytical agents (Critic, Dr. Doom) |
| **Research Model** | Perplexity Sonar | perplexity/sonar-pro | Fact-checking, risk research |
| **Embeddings** | OpenAI | text-embedding-3-small | Vector generation for Qdrant |
| **Agent Memory** | Zep v3 | - | Conversation context |
| **Knowledge Graph** | Graphiti | standalone | Tech standards, decisions |
| **Graph Backend** | FalkorDB | latest | Redis-based graph storage |
| **Vector Database** | Qdrant | v1.16 | Semantic document search |

### Dashboard Frontend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| **Framework** | TanStack Start | latest | Full-stack React with SSR |
| **UI Components** | Shadcn/ui | new-york | Component library (16+ components) |
| **Primitives** | Radix UI | - | Accessible primitives |
| **Authentication** | Better-Auth | - | Google OAuth 2.0 |
| **Data Fetching** | TanStack Query | - | Caching, mutations |
| **Forms** | React Hook Form | - | Form state, validation |
| **Validation** | Zod | - | Schema validation |
| **Styling** | Tailwind CSS | - | Utility-first CSS |
| **Notifications** | Sonner | - | Toast notifications |
| **Icons** | Lucide React | - | Icon library |

### DevOps & Deployment

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Containerization** | Docker Compose | Multi-service orchestration |
| **CI/CD** | GitHub Actions | Automated testing, deployment |
| **Hosting** | Dokploy | Self-hosted PaaS |
| **SSL** | Let's Encrypt | Automatic certificate management |
| **Testing** | Vitest | Unit/integration testing |
| **Linting** | ESLint | Code quality |
| **Type Checking** | TypeScript | Static type analysis |

### Environment Variables Summary

```bash
# ============================================
# DATABASE
# ============================================
POSTGRES_USER=n8n
POSTGRES_PASSWORD=<secure_password>
POSTGRES_DB=n8n
DATABASE_URL=postgresql://n8n:password@postgres:5432/n8n

# ============================================
# n8n WORKFLOW ENGINE
# ============================================
N8N_ENCRYPTION_KEY=<32_char_encryption_key>
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=<password>
WEBHOOK_URL=https://n8n.yourdomain.com

# ============================================
# AI SERVICES
# ============================================
OPENROUTER_API_KEY=<openrouter_key>
OPENAI_API_KEY=<openai_key>     # For embeddings
PERPLEXITY_API_KEY=<perplexity_key>

# ============================================
# KNOWLEDGE SERVICES
# ============================================
GRAPHITI_URL=http://graphiti:8000
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=<qdrant_key>     # Optional

# ============================================
# S3 STORAGE
# ============================================
S3_ENDPOINT=http://seaweedfs:8333
S3_BUCKET=product-factory-artifacts
S3_ACCESS_KEY=admin
S3_SECRET_KEY=<s3_secret>

# ============================================
# DASHBOARD
# ============================================
AUTH_SECRET=<32_char_auth_secret>
GOOGLE_CLIENT_ID=<oauth_client_id>
GOOGLE_CLIENT_SECRET=<oauth_client_secret>
AUTH_URL=https://dashboard.yourdomain.com
ALLOWED_EMAIL_DOMAINS=yourdomain.com

# ============================================
# WORKFLOW CONFIGURATION
# ============================================
FACTORY_MAX_ITERATIONS=5
FACTORY_SCORE_THRESHOLD=90
FACTORY_BATCH_SIZE=3
FACTORY_CONFIRMATION_TIMEOUT=3600
```

---

## 5. AI Agent System

### Agent Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AI AGENT DREAM TEAM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   PHASE 0                         PHASE 1                    PHASE 2        │
│  ┌──────────┐                   ┌──────────┐               ┌──────────┐    │
│  │SCAVENGER │                   │VISIONARY │               │ARCHITECT │    │
│  │ Claude   │                   │ Claude   │               │ Claude   │    │
│  │ T=0.2    │                   │ T=0.7    │               │ T=0.5    │    │
│  └────┬─────┘                   └────┬─────┘               └────┬─────┘    │
│       │                              │                          │           │
│       ▼                              ▼                          ▼           │
│  Extract tech                  Create Vision              Design ARC42      │
│  standards                     drafts                     architecture      │
│                                      │                          │           │
│                                      ▼                          ▼           │
│                                ┌──────────┐               ┌──────────┐     │
│                                │  CRITIC  │               │ DR. DOOM │     │
│                                │  GPT-4o  │               │  GPT-4o  │     │
│                                │  T=0.3   │               │  T=0.2   │     │
│                                └────┬─────┘               └────┬─────┘     │
│                                     │                          │            │
│                                     ▼                          ▼            │
│                                Evaluate &                 Pre-mortem        │
│                                score                      risk analysis     │
│                                     │                          │            │
│                                     │                          ▼            │
│                                     │                    ┌──────────┐       │
│                                     │                    │  FIXER   │       │
│                                     │                    │Perplexity│       │
│                                     │                    │  T=0.4   │       │
│                                     │                    └────┬─────┘       │
│                                     │                         │             │
│                                     │                    Research           │
│                                     │                    mitigations        │
│                                     ▼                         ▼             │
│                                ┌──────────┐               ┌──────────┐     │
│                                │ REFINER  │               │ REFINER  │     │
│                                │ Claude   │               │ Claude   │     │
│                                │ T=0.5    │               │ T=0.5    │     │
│                                └──────────┘               └──────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Agent Configuration Details

| Agent | Model | Temp | Memory | Tools | Purpose |
|-------|-------|------|--------|-------|---------|
| **Scavenger** | Claude Sonnet 3.5 | 0.2 | - | - | Extract tech standards from documents |
| **Visionary** | Claude Sonnet 3.5 | 0.7 | Zep (8 msgs) | Graphiti | Create Product Vision drafts |
| **Critic** | GPT-4o | 0.3 | Zep (6 msgs) | Perplexity | Evaluate and score with fact-checking |
| **Refiner** (Vision) | Claude Sonnet 3.5 | 0.5 | Zep (10 msgs) | Graphiti | Improve Vision based on feedback |
| **Architect** | Claude Sonnet 3.5 | 0.5 | Zep (10 msgs) | Graphiti | Design ARC42 architecture |
| **Dr. Doom** | GPT-4o | 0.2 | - | - | Pre-mortem risk analysis |
| **Fixer** | Perplexity Sonar | 0.4 | - | - | Research risk mitigations |
| **Refiner** (Arch) | Claude Sonnet 3.5 | 0.5 | Zep (10 msgs) | Graphiti | Apply architecture fixes |

### Scoring Criteria

**Vision Loop (0-100 scale):**
| Dimension | Weight | Description |
|-----------|--------|-------------|
| Problem Clarity | 15% | Is the problem clearly defined? |
| Value Proposition | 25% | Is it compelling and differentiated? |
| Persona Depth | 15% | Are personas specific with JTBD? |
| Differentiation | 20% | Is competitive advantage clear? |
| Metrics Quality | 10% | Are metrics SMART? |
| Market Validation | 15% | Is there evidence? |

**Architecture Loop (0-100 scale):**
| Dimension | Weight | Description |
|-----------|--------|-------------|
| Technical Completeness | 25% | All ARC42 sections covered? |
| Tech Stack Compliance | 20% | Uses only approved technologies? |
| Risk Mitigation | 20% | Are risks addressed? |
| Scalability | 15% | Can it grow? |
| Security | 20% | Security concerns addressed? |

---

## 6. Workflow Phases

### Phase 0: Context Scavenging (2-5 minutes)

**Purpose:** Extract and govern technical standards from source documents

**Process:**
1. Scan documents from S3 input folder
2. Scavenger Agent extracts technical patterns
3. Present Governance Widget to user
4. User approves/skips/selects alternatives
5. Store approved standards in Graphiti (global/local scope)
6. Generate embeddings and store in Qdrant

**Governance Payload Example:**
```json
{
  "type": "governance_request",
  "scavenging_id": "sc_abc123",
  "project_id": "myproject",
  "detected_stack": [
    {
      "id": "tech_001",
      "name": "PostgreSQL",
      "type": "technology",
      "category": "database",
      "confidence": 0.95,
      "source": "architecture.md",
      "alternatives": [
        { "name": "MySQL", "description": "Alternative RDBMS" },
        { "name": "CockroachDB", "description": "Distributed SQL" }
      ]
    }
  ]
}
```

### Phase 1: Vision Loop (5-15 minutes)

**Purpose:** Generate and refine Product Vision document

**Process:**
1. Visionary creates initial draft
2. Critic evaluates with Perplexity fact-checking
3. If score < 90: Refiner improves
4. Loop until score >= 90 or max iterations (5)
5. Circuit breaker if max iterations reached

**Vision Document Structure:**
- Executive Summary
- Problem Statement
- Target Personas & JTBD
- Value Proposition
- Competitive Differentiation
- Success Metrics
- Market Validation

### Phase 2: Architecture Loop (5-15 minutes)

**Purpose:** Generate ARC42 architecture document with risk validation

**Process:**
1. Architect creates ARC42 draft (MUST use approved tech stack)
2. Dr. Doom performs pre-mortem analysis
3. If risks need research: Fixer researches mitigations
4. Refiner applies fixes
5. Loop until score >= 90 or max iterations (5)

**ARC42 Document Structure:**
1. Introduction and Goals
2. Constraints
3. Context and Scope
4. Solution Strategy
5. Building Block View
6. Runtime View
7. Deployment View
8. Cross-cutting Concepts
9. Architecture Decisions (ADRs)
10. Quality Requirements
11. Risks and Technical Debt
12. Glossary

### Phase 3: Finalization

**Purpose:** Save artifacts and complete project

**Process:**
1. Save ProductVision_FINAL.md to S3
2. Save Architecture_FINAL.md to S3
3. Generate decision_log.md
4. Update project_state in PostgreSQL
5. Set completed_at timestamp

---

## 7. Dashboard Application

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Framework** | TanStack Start | SSR React with file-based routing |
| **Auth** | Better-Auth | Google OAuth 2.0 |
| **UI** | Shadcn/ui + Radix | Component library |
| **Data** | TanStack Query | Fetching and caching |
| **Forms** | React Hook Form + Zod | Validation |
| **Toast** | Sonner | Notifications |

### Key Features

| Feature | Description |
|---------|-------------|
| **Project Grid** | Overview of all projects with status |
| **Artifacts Tab** | View/download generated documents |
| **ADR Viewer** | Split-pane ADR browser |
| **Chat Interface** | Workflow interaction |
| **History Timeline** | Iteration history |
| **ZIP Export** | Download all artifacts |
| **Setup Wizard** | 6-step n8n configuration |
| **Settings Management** | n8n config, re-run wizard |

### Route Structure

```
/                       → Redirect to /projects
/projects               → Project list
/projects/new           → Create new project
/projects/$projectId    → Project detail (tabs)
/setup/*                → Setup wizard (6 steps)
/settings/n8n           → n8n configuration
/api/health             → Health check
/api/start-project      → Create project
/api/presigned-url      → S3 upload URL
/api/governance         → Submit governance
/api/setup/*            → Setup wizard API
```

### Error Handling

| Component | Purpose |
|-----------|---------|
| `RouteErrorBoundary` | Route-level error catching |
| `NotFound` | 404 pages |
| Loading Skeletons | Smooth transitions |
| Toast Notifications | User feedback |

---

## 8. Data Architecture

### PostgreSQL Schema

```sql
-- Project state
CREATE TABLE project_state (
  project_id VARCHAR PRIMARY KEY,
  project_name VARCHAR NOT NULL,
  session_id VARCHAR,
  current_phase INTEGER DEFAULT 0,
  phase_status VARCHAR DEFAULT 'pending',
  tech_standards_global JSONB DEFAULT '[]',
  tech_standards_local JSONB DEFAULT '[]',
  artifact_vision_draft TEXT,
  artifact_vision_final TEXT,
  artifact_architecture_draft TEXT,
  artifact_architecture_final TEXT,
  artifact_decision_log TEXT,
  last_iteration_phase INTEGER,
  last_iteration_number INTEGER,
  last_iteration_score NUMERIC,
  total_iterations INTEGER DEFAULT 0,
  total_duration_ms BIGINT DEFAULT 0,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Decision log entries
CREATE TABLE decision_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR REFERENCES project_state(project_id),
  session_id VARCHAR,
  entry_type VARCHAR CHECK (entry_type IN (
    'log_decision', 'log_iteration', 'log_approval',
    'log_phase_start', 'log_phase_end', 'log_error', 'log_info'
  )),
  phase INTEGER,
  iteration INTEGER,
  agent_name VARCHAR,
  score NUMERIC,
  issues_count INTEGER,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Chat messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR REFERENCES project_state(project_id),
  session_id VARCHAR,
  role VARCHAR CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT,
  message_type VARCHAR,
  payload JSONB DEFAULT '{}',
  n8n_execution_id VARCHAR,
  response_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- App settings (encrypted values supported)
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  setting_type VARCHAR(50) DEFAULT 'string',
  is_sensitive BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Workflow registry
CREATE TABLE workflow_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name VARCHAR(255) NOT NULL,
  workflow_file VARCHAR(255) UNIQUE NOT NULL,
  n8n_workflow_id VARCHAR(100),
  local_version VARCHAR(50) NOT NULL,
  webhook_paths JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT FALSE,
  import_status VARCHAR(50) DEFAULT 'pending',
  last_import_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### S3 Storage Structure

```
product-factory-artifacts/
└── projects/{project_id}/
    ├── input/                      # User-uploaded documents
    │   ├── requirements.pdf
    │   ├── architecture.md
    │   └── tech-standards.docx
    ├── state/
    │   └── project_state.json      # Resumable state
    ├── artifacts/
    │   ├── decision_log.md         # Complete paper trail
    │   ├── ProductVision_FINAL.md
    │   └── Architecture_FINAL.md
    ├── iterations/
    │   └── {session_timestamp}/
    │       ├── Vision_v1.md
    │       ├── Vision_v1_critique.json
    │       └── Architecture_v2_FINAL.md
    └── standards/
        ├── global_standards.json
        └── local_standards.json
```

### Knowledge Graph (Graphiti)

| Group ID | Content | Scope |
|----------|---------|-------|
| `global_standards` | Approved technologies | All projects |
| `{project_id}` | Project-specific standards | Single project |

### Vector Database (Qdrant)

| Collection | Content | Embedding Model |
|------------|---------|-----------------|
| `titan_documents` | Document chunks | text-embedding-3-small |

---

## 9. API Reference

### Dashboard REST API

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | No | Health check |
| `/api/auth/*` | GET/POST | - | Better-Auth routes |
| `/api/start-project` | POST | Yes | Create and start project |
| `/api/presigned-url` | POST | Yes | Get S3 upload URL |
| `/api/governance` | POST | Yes | Submit governance decisions |
| `/api/setup/status` | GET | No | Check setup completion |
| `/api/setup/n8n/test-connection` | POST | Yes | Test n8n connectivity |
| `/api/setup/n8n/save-config` | POST | Yes | Save n8n config |
| `/api/setup/workflows/list` | GET | Yes | List workflows |
| `/api/setup/workflows/import` | POST | Yes | Import workflows |
| `/api/setup/complete` | POST | Yes | Complete setup |
| `/api/settings/n8n` | GET/PUT | Yes | n8n settings |

### n8n Webhooks

| Webhook | Method | Description |
|---------|--------|-------------|
| `/webhook/start-project` | POST | Start new project |
| `/webhook/governance-batch` | POST | Receive governance decisions |
| `/webhook/ai-product-factory-chat` | POST | Chat messages |

---

## 10. Infrastructure & Deployment

### Docker Services (9 total)

| Service | Image | Port | Health Check |
|---------|-------|------|--------------|
| **traefik** | traefik:v3.6.7 | 80, 443, 8080 | wget /ping |
| **n8n** | n8nio/n8n:next | 5678 | wget /healthz |
| **postgres** | postgres:18-alpine | 5432 | pg_isready |
| **redis** | redis:7.4-alpine | 6379 | redis-cli ping |
| **qdrant** | qdrant/qdrant:v1.16 | 6333 | bash TCP check |
| **falkordb** | falkordb/falkordb:latest | 6379 | redis-cli ping |
| **graphiti** | zepai/knowledge-graph-mcp:standalone | 8000 | curl /health |
| **seaweedfs** | chrislusf/seaweedfs:latest | 8333, 9333 | wget /cluster/status |
| **dashboard** | Built from ./frontend | 3000 | wget /api/health |

### CI/CD Pipeline

```yaml
Jobs:
1. validate      # Lint + typecheck
2. test          # Backend + frontend tests
3. sync-workflows # Push to n8n
4. deploy        # Dokploy webhook
5. health-check  # Verify services
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `N8N_API_URL` | n8n instance URL |
| `N8N_API_KEY` | n8n API key |
| `DOKPLOY_WEBHOOK_URL` | Deploy webhook |
| `DASHBOARD_URL` | Health check URL |

---

## 11. Testing Strategy

### Test Structure

```
tests/
├── helpers/                    # Shared utilities
│   ├── service-availability.ts # Service detection
│   ├── test-fixtures.ts        # Data generators
│   ├── s3-helpers.ts          # S3 operations
│   ├── db-helpers.ts          # Database operations
│   └── wait-helpers.ts        # Polling utilities
├── mocks/
│   ├── mock-n8n-server.ts     # n8n webhook mock
│   └── governance-payloads.ts # Test payloads
├── integration/               # Integration tests (79 tests)
│   ├── 01-file-upload.test.ts
│   ├── 02-project-creation.test.ts
│   ├── 03-governance-flow.test.ts
│   ├── 04-phase-transitions.test.ts
│   ├── 05-artifact-storage.test.ts
│   ├── 06-error-recovery.test.ts
│   └── 07-state-resumption.test.ts
└── e2e/
    └── complete-workflow.test.ts
```

### Test Commands

```bash
npm run test:backend      # Backend integration
npm run test:frontend     # Frontend components
npm run test:integration  # Full integration suite
npm run test:e2e          # End-to-end tests
npm run test:all          # Everything
```

### Test Coverage

| Category | Tests | Status |
|----------|-------|--------|
| **Backend Integration** | 79 | ✅ Passing |
| **Frontend Components** | 342+ | ✅ Passing |
| **Total** | 421+ | ✅ Passing |

---

## 12. Current Limitations & Known Issues

### Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| **Single project per user at a time** | Can't run parallel projects | Queue projects |
| **No partial resume within phase** | Must restart phase if interrupted | State checkpoints |
| **English only** | UI and generated content | Localization needed |
| **No real-time progress updates** | User waits without feedback | Polling-based updates |
| **Graphiti cold start** | 60-90s initialization | Use start_period |

### Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Memory overcommit warning (Redis/FalkorDB) | Low | Host-level fix |
| Python task runner warning (n8n) | Low | Ignorable |
| Perplexity rate limits | Medium | 1s delay implemented |

---

## 13. Improvement Opportunities

### High Priority

| Improvement | Benefit | Complexity |
|-------------|---------|------------|
| **Real-time progress streaming** | Better UX during long waits | Medium |
| **Multi-project parallel execution** | Higher throughput | High |
| **Caching of Perplexity results** | Reduce API costs | Low |
| **Internationalization (i18n)** | Broader audience | Medium |
| **Export to PDF** | Professional output format | Low |

### Medium Priority

| Improvement | Benefit | Complexity |
|-------------|---------|------------|
| **Template customization** | Industry-specific output | Medium |
| **Team collaboration** | Multi-user projects | High |
| **Version history for artifacts** | Track changes over time | Medium |
| **Integration with Jira/Linear** | Auto-create tasks from ADRs | Medium |
| **Slack/Teams notifications** | Workflow status updates | Low |

### Low Priority / Future

| Improvement | Benefit | Complexity |
|-------------|---------|------------|
| **Self-hosted LLM support** | Data sovereignty | High |
| **Custom agent creation UI** | User-defined workflows | High |
| **Analytics dashboard** | Usage insights | Medium |
| **API for external integrations** | Developer ecosystem | Medium |
| **Mobile-responsive dashboard** | Access from any device | Low |

### Architecture Improvements

| Area | Current | Recommended |
|------|---------|-------------|
| **State Management** | PostgreSQL polling | WebSocket events |
| **File Processing** | Sequential | Parallel workers |
| **LLM Calls** | Direct API | Batched with queuing |
| **Monitoring** | Basic logs | OpenTelemetry + Grafana |
| **Testing** | Integration tests | Add E2E visual tests |

---

## Appendix: Quick Reference

### NPM Commands

```bash
# Development
npm run dev               # Start frontend dev server
npm run build             # Build for production

# Testing
npm run test:backend      # Backend tests
npm run test:frontend     # Frontend tests
npm run test:integration  # Integration tests
npm run test:all          # All tests

# Docker
npm run test:env:up       # Start test environment
npm run test:env:down     # Stop test environment

# Workflows
npm run sync-workflows    # Sync to n8n
```

### Key URLs

| Service | Local | Production |
|---------|-------|------------|
| **n8n** | http://localhost:5678 | https://n8n.yourdomain.com |
| **Dashboard** | http://localhost:3000 | https://dashboard.yourdomain.com |
| **Traefik** | http://localhost:8080 | N/A |
| **Qdrant** | http://localhost:6333 | Internal only |
| **Graphiti** | http://localhost:8000 | Internal only |

### Version History

| Version | Date | Highlights |
|---------|------|------------|
| v3.0.2 | 2026-01-18 | Integration test suite (79 tests), unused import cleanup |
| v3.0.1 | 2026-01-16 | Resilient DB queries, fallback implementations |
| v3.0.0 | 2026-01-16 | Setup Wizard, encrypted API keys, 390 tests |
| v2.9.0 | 2026-01-15 | Route error boundaries, loading skeletons, toasts |
| v2.8.x | 2026-01-14-15 | n8n auto-bootstrap, local-prod testing, structured logging |
| v2.7.0 | 2026-01-14 | S3-only storage, removed Google Drive |
| v2.6.0 | 2026-01-14 | Batch governance UI (GovernanceWidget) |
| v2.5.0 | 2026-01-14 | File upload with presigned URLs |

---

*Document generated: 2026-01-18*
*For the latest updates, see [CLAUDE.md](CLAUDE.md)*
