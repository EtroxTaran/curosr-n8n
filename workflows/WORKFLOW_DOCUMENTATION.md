# AI Product Factory - Complete Workflow Documentation

**Version:** 3.0.0
**Date:** 2026-01-14
**Status:** Production Ready

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Workflow Execution Order](#workflow-execution-order)
4. [Detailed Workflow Documentation](#detailed-workflow-documentation)
5. [Agent Configuration](#agent-configuration)
6. [Requirements Compliance](#requirements-compliance)
7. [Data Flow Diagrams](#data-flow-diagrams)
8. [API Dependencies](#api-dependencies)
9. [File Structure](#file-structure)

---

## Executive Summary

The **AI Product Factory** is a sophisticated n8n-based multi-agent workflow system that automatically generates comprehensive **Product Vision** and **Architecture** documents through iterative, adversarial AI agent collaboration with human-in-the-loop governance.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Multi-Project Support** | Handles multiple concurrent projects with isolated state |
| **Iterative Updates** | Adversarial refinement loops until quality threshold met |
| **Shared Global Tech Stack** | Enforces approved technologies across all projects |
| **Tech Stack Evolution** | Human-approved additions to global standards |
| **State Persistence** | Resume any project from last checkpoint |
| **Complete Paper Trail** | Full audit trail of all decisions and iterations |

### Workflow Systems

The repository contains **two workflow systems**:

1. **Titan Workflow Suite** (Legacy) - Original implementation with 5 workflows
2. **AI Product Factory** (Current) - Enhanced human-in-the-loop system with 6 workflows

This documentation focuses on the **AI Product Factory** system as the primary production system.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          AI PRODUCT FACTORY SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────┐                                                           │
│  │   User Input     │  Google Drive Folder + Project Name                       │
│  │   (Chat Trigger) │  OR "Resume" to continue existing project                 │
│  └────────┬─────────┘                                                           │
│           │                                                                      │
│           ▼                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    MAIN ORCHESTRATOR                                      │   │
│  │                                                                           │   │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌────────────┐   │   │
│  │  │Smart Start  │ → │  Phase 0    │ → │  Phase 1    │ → │  Phase 2   │   │   │
│  │  │Handler      │   │ Scavenging  │   │Vision Loop  │   │Arch Loop   │   │   │
│  │  └─────────────┘   └─────────────┘   └─────────────┘   └────────────┘   │   │
│  │        │                  │                 │                 │          │   │
│  │        ▼                  ▼                 ▼                 ▼          │   │
│  │   [Resume?] ─────► [Tech Standards] ► [Vision Doc] ───► [Arch Doc]     │   │
│  │                     + Governance         Score ≥90        Score ≥90     │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         SUBWORKFLOWS                                      │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │   │
│  │  │  Context        │  │ Vision          │  │ Architecture    │          │   │
│  │  │  Scavenging     │  │ Adversarial     │  │ Adversarial     │          │   │
│  │  │                 │  │ Loop            │  │ Loop            │          │   │
│  │  │  • Document     │  │                 │  │                 │          │   │
│  │  │    Scanning     │  │ • Visionary     │  │ • Architect     │          │   │
│  │  │  • Standard     │  │ • Critic        │  │ • Dr. Doom      │          │   │
│  │  │    Extraction   │  │ • Refiner       │  │ • Fixer         │          │   │
│  │  │  • Human        │  │                 │  │ • Refiner       │          │   │
│  │  │    Governance   │  │                 │  │                 │          │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │   │
│  │                                                                           │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │   │
│  │  │ Perplexity      │  │ Decision        │  │ Titan           │          │   │
│  │  │ Research Tool   │  │ Logger          │  │ Subworkflows    │          │   │
│  │  │                 │  │                 │  │                 │          │   │
│  │  │ • Fact Check    │  │ • log_decision  │  │ • Graphiti Ops  │          │   │
│  │  │ • Market        │  │ • log_iteration │  │ • Qdrant Ops    │          │   │
│  │  │ • Best Practice │  │ • log_approval  │  │                 │          │   │
│  │  │ • Risk Mitgate  │  │ • log_phase_*   │  │                 │          │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                      EXTERNAL SERVICES                                    │   │
│  │                                                                           │   │
│  │  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐      │   │
│  │  │ OpenRouter │   │  Graphiti  │   │   Qdrant   │   │  Google    │      │   │
│  │  │            │   │            │   │            │   │  Drive     │      │   │
│  │  │ • Claude   │   │ Knowledge  │   │ Vector     │   │            │      │   │
│  │  │ • GPT-4o   │   │ Graph      │   │ Database   │   │ Document   │      │   │
│  │  │ • Sonar    │   │            │   │            │   │ Storage    │      │   │
│  │  └────────────┘   └────────────┘   └────────────┘   └────────────┘      │   │
│  │                                                                           │   │
│  │  ┌────────────┐                                                          │   │
│  │  │   Zep v3   │   Agent Memory (Conversation Context)                    │   │
│  │  └────────────┘                                                          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Workflow Execution Order

### Complete Flow Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXECUTION SEQUENCE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

USER INPUT
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. MAIN ORCHESTRATOR ENTRY                                                  │
│    • Parse user message (project name, drive folder ID)                     │
│    • Check for "Resume" keyword                                             │
│    • Generate session ID                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ├──────────────────────────────┐
    │ Is Resume Request?           │
    │                              ▼
    │                    ┌─────────────────────────────────────────────────┐
    │                    │ RESUME PATH                                     │
    │                    │ • Find AI_Product_Factory folder               │
    │                    │ • List existing projects                       │
    │                    │ • Load project_state.json                      │
    │                    │ • Present resume options to user               │
    │                    │ • Continue from saved phase                    │
    │                    └─────────────────────────────────────────────────┘
    │
    ▼ (New Project)
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. PROJECT INITIALIZATION                                                   │
│    • Create AI_Product_Factory/{ProjectName}/ folder                        │
│    • Create initial project_state.json                                      │
│    • Save to Google Drive                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. PHASE 0: CONTEXT SCAVENGING                               [2-10 minutes] │
│    ─────────────────────────────────────────────────────────────────────── │
│    WORKFLOW: ai-product-factory-scavenging-subworkflow.json                │
│                                                                             │
│    SEQUENCE:                                                                │
│    a) State Initializer - Validate inputs, generate scavenging_id          │
│    b) List Drive Files - Get all documents from source folder              │
│    c) Prepare Documents - Filter for processable types                     │
│    d) FOR EACH document (batch):                                           │
│       i.   Download Document (if from Google Drive)                        │
│       ii.  Extract Text Content                                            │
│       iii. Scavenger Agent (Claude 3.5 Sonnet)                            │
│            - Extract technical standards, patterns, decisions              │
│            - Output: JSON array of standards                               │
│       iv.  Parse Extracted Standards                                       │
│    e) Aggregate All Standards (deduplicate)                                │
│    f) FOR EACH standard:                                                   │
│       i.   Check if exists in Graphiti (global_standards)                 │
│       ii.  IF new standard:                                                │
│            - Prepare Approval Request message                              │
│            - Wait for User Approval (webhook)                              │
│            - Process user response (global/local/skip)                     │
│            - IF approved:                                                  │
│              * Store in Graphiti (scope-aware)                            │
│              * Store in Qdrant (with embedding)                           │
│              * Log to Decision Logger                                      │
│    g) Final Aggregation - Summary of all processed standards              │
│                                                                             │
│    OUTPUT: { processed_standards[], summary }                              │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STATE CHECKPOINT: Update project_state.json (Phase 0 complete)             │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. PHASE 1: VISION ADVERSARIAL LOOP                          [5-15 minutes]│
│    ─────────────────────────────────────────────────────────────────────── │
│    WORKFLOW: ai-product-factory-vision-loop-subworkflow.json               │
│                                                                             │
│    AGENTS:                                                                  │
│    • Visionary (Claude 3.5 Sonnet, temp=0.7) - Creates draft              │
│    • Critic (GPT-4o, temp=0.3) - Evaluates & scores                       │
│    • Refiner (Claude 3.5 Sonnet, temp=0.5) - Improves based on feedback   │
│                                                                             │
│    SEQUENCE:                                                                │
│    a) Loop State Initializer                                               │
│       - Validate inputs                                                    │
│       - Set max_iterations (default: 5)                                    │
│       - Set score_threshold (default: 90)                                  │
│                                                                             │
│    b) ITERATION LOOP:                                                      │
│       ┌─────────────────────────────────────────────────────────┐         │
│       │ i. Visionary Agent                                       │         │
│       │    - Input: context, tech_standards                      │         │
│       │    - Output: Product Vision document (Markdown)          │         │
│       │    - Memory: Zep (8 messages)                            │         │
│       │    - Tools: Knowledge Graph (Graphiti)                   │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ ii. Draft State Updater                                  │         │
│       │    - Store draft in iteration_history                    │         │
│       │    - Increment iteration counter                         │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ iii. Critic Agent                                        │         │
│       │    - Input: draft document                               │         │
│       │    - Scoring Criteria (weighted):                        │         │
│       │      * problem_clarity (15%)                             │         │
│       │      * value_prop_strength (25%)                         │         │
│       │      * persona_depth (15%)                               │         │
│       │      * differentiation (20%)                             │         │
│       │      * metrics_quality (10%)                             │         │
│       │      * market_validation (15%)                           │         │
│       │    - Output: JSON { score, issues[], strengths[] }       │         │
│       │    - Memory: Zep (6 messages)                            │         │
│       │    - Tools: Perplexity Research (fact-checking)          │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ iv. Critic Response Parser                               │         │
│       │    - Extract score (0-100)                               │         │
│       │    - Store feedback in iteration_history                 │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ v. Quality Threshold Gate                                │         │
│       │    IF score >= threshold → SUCCESS (exit loop)           │         │
│       │    ELSE → continue to iteration check                    │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ vi. Iteration Limit Gate                                 │         │
│       │    IF iteration >= max_iterations → CIRCUIT BREAKER      │         │
│       │    ELSE → continue to Refiner                            │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ vii. Refiner Agent                                       │         │
│       │    - Input: draft + critic feedback                      │         │
│       │    - Output: Improved document                           │         │
│       │    - Memory: Zep (10 messages)                           │         │
│       │    - Tools: Knowledge Graph                              │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ viii. Refiner State Updater                              │         │
│       │    - Store refined draft                                 │         │
│       │    - Loop back to Critic                                 │         │
│       └─────────────────────────────────────────────────────────┘         │
│                                                                             │
│    c) CIRCUIT BREAKER (if max iterations reached):                         │
│       - Present escalation message to user                                 │
│       - Wait for human guidance (webhook)                                  │
│       - Options: accept, guidance, lower_threshold, restart               │
│                                                                             │
│    OUTPUT: { final_draft, final_score, iteration_history[], telemetry }   │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STATE CHECKPOINT: Update project_state.json (Phase 1 complete)             │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. PHASE 2: ARCHITECTURE ADVERSARIAL LOOP                    [5-15 minutes]│
│    ─────────────────────────────────────────────────────────────────────── │
│    WORKFLOW: ai-product-factory-architecture-loop-subworkflow.json         │
│                                                                             │
│    AGENTS:                                                                  │
│    • Architect (Claude 3.5 Sonnet, temp=0.5) - Creates ARC42 document     │
│    • Dr. Doom (GPT-4o, temp=0.2) - Pre-mortem risk analysis               │
│    • Fixer (Perplexity Sonar, temp=0.5) - Researches mitigations          │
│    • Refiner (Claude 3.5 Sonnet, temp=0.5) - Applies fixes                │
│                                                                             │
│    SEQUENCE:                                                                │
│    a) Loop State Initializer                                               │
│                                                                             │
│    b) Load Tech Stack from Graphiti                                        │
│       - Query global_standards + project-local standards                   │
│       - Merge with provided standards                                      │
│                                                                             │
│    c) ITERATION LOOP:                                                      │
│       ┌─────────────────────────────────────────────────────────┐         │
│       │ i. Architect Agent                                       │         │
│       │    - Input: vision_document, tech_standards              │         │
│       │    - STRICT: Must use ONLY approved technologies         │         │
│       │    - Output: ARC42 Architecture document                 │         │
│       │      1. Introduction and Goals                           │         │
│       │      2. Constraints                                      │         │
│       │      3. Context and Scope                                │         │
│       │      4. Solution Strategy                                │         │
│       │      5. Building Block View                              │         │
│       │      6. Runtime View                                     │         │
│       │      7. Deployment View                                  │         │
│       │      8. Cross-cutting Concepts                           │         │
│       │      9. Architecture Decisions                           │         │
│       │      10. Quality Requirements                            │         │
│       │      11. Risks and Technical Debt                        │         │
│       │      12. Glossary                                        │         │
│       │    - Memory: Zep (10 messages)                           │         │
│       │    - Tools: Tech Stack Query (Graphiti)                  │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ ii. Dr. Doom Validator Agent (Pre-Mortem)                │         │
│       │    - Imagine system failed catastrophically              │         │
│       │    - Identify: single points of failure, bottlenecks,    │         │
│       │      security vulnerabilities, tech stack violations     │         │
│       │    - Output: JSON { score, doom_scenarios[],             │         │
│       │              tech_stack_violations[], security_concerns[]}│         │
│       │    - Flag risks requiring research (requires_research)   │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ iii. Risk Parser                                         │         │
│       │    - Extract risks needing research                      │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ iv. IF risks need research:                              │         │
│       │    a. Split Risks for parallel research                  │         │
│       │    b. Fixer Research Agent (Perplexity Sonar)           │         │
│       │       - Research mitigation strategies                   │         │
│       │       - Query type: risk_mitigation                      │         │
│       │    c. Aggregate Research Results                         │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ v. Quality Threshold Gate                                │         │
│       │    IF score >= threshold → SUCCESS                       │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ vi. Iteration Limit Gate                                 │         │
│       │    IF iteration >= max → CIRCUIT BREAKER                 │         │
│       ├─────────────────────────────────────────────────────────┤         │
│       │ vii. Refiner Agent                                       │         │
│       │    - Input: draft + Dr. Doom feedback + Fixer research  │         │
│       │    - Apply mitigations while respecting tech stack       │         │
│       │    - Loop back to Dr. Doom                               │         │
│       └─────────────────────────────────────────────────────────┘         │
│                                                                             │
│    OUTPUT: { final_draft, final_score, iteration_history[], fixes[] }     │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. FINALIZATION                                                             │
│    • Update final project_state.json                                        │
│    • Generate completion summary                                            │
│    • Output final documents and telemetry                                   │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
OUTPUT: Vision Document + Architecture Document + Decision Log
```

---

## Detailed Workflow Documentation

### 1. AI Product Factory - Main Orchestrator

**File:** `ai-product-factory-main-workflow.json`
**Trigger:** Chat Trigger (with file upload support)
**Purpose:** Central orchestrator managing the complete document generation lifecycle

**Key Features:**
- Smart Start: Parses user input for project name and Drive folder
- Resume Detection: Detects "resume" keyword and loads previous state
- State Persistence: Saves project state to Google Drive after each phase
- Static Data Pattern: Preserves state across subworkflow calls

**Node Flow:**
```
User Chat Entry Point
    ↓
Smart Start Handler (parse input, detect resume)
    ↓
Resume Request? ──Yes──→ Find Factory Folder → List Projects → Load State
    │ No
    ↓
Needs More Info? ──Yes──→ Request More Info → Intermediate Output
    │ No
    ↓
Initialize New Project → Create Project Folder → Create Initial State
    ↓
Save Initial State → Ready for Phase 0
    ↓
Log Phase 0 Start → Run Phase 0: Scavenging
    ↓
Update State After Phase 0 → Save State After Phase 0
    ↓
Run Phase 1: Vision Loop → Update State After Phase 1
    ↓
Run Phase 2: Architecture Loop → Finalize Workflow → Final Output
```

---

### 2. AI Product Factory - Context Scavenging

**File:** `ai-product-factory-scavenging-subworkflow.json`
**Purpose:** Extract technical standards from source documents with human governance

**Key Features:**
- Multi-source support: Google Drive folders and direct file uploads
- Batch processing: Documents processed sequentially through Scavenger Agent
- Human-in-the-loop: Each new standard requires explicit approval
- Dual storage: Approved standards stored in both Graphiti and Qdrant

**Agents:**
| Agent | Model | Temperature | Purpose |
|-------|-------|-------------|---------|
| Scavenger | Claude 3.5 Sonnet | 0.2 | Extract technical standards from documents |

**Node Flow:**
```
Subworkflow Entry Point → State Initializer
    ↓
Has Drive Folder? ──Yes──→ List Drive Files
    │ No                          ↓
    ↓                      Prepare Documents
No Drive Folder Handler ──────────↓
                                  ↓
Document Batch Processor (loop each document)
    ↓
Prepare Single Document → Needs Download?
    │                          ↓ Yes
    │                   Download Document → Extract Text Content
    ↓                          ↓
Merge Content ←────────────────┘
    ↓
Scavenger Agent (Claude 3.5 Sonnet)
    ↓
Parse Extracted Standards → Document Batch Processor (loop)
    ↓ (when batch complete)
Aggregate All Standards → Split for Governance
    ↓
Check Existing Standard (Graphiti query)
    ↓
Check Governance Status → Needs User Approval?
    │ Yes                              │ No
    ↓                                  ↓
Prepare Approval Request     Already Exists Handler
    ↓                                  ↓
Wait for User Approval (webhook)      │
    ↓                                  │
Process Approval Response             │
    ↓                                  │
Was Approved? ──Yes──→ Store in Graphiti (parallel)
    │                   Store in Qdrant (parallel)
    │                          ↓
    │                   Log Approval Decision
    │ No                       ↓
    ↓                          │
Skip Standard                  │
    ↓                          │
Merge Governance Results ←─────┘
    ↓
Final Aggregation → Subworkflow Output
```

---

### 3. AI Product Factory - Vision Adversarial Loop

**File:** `ai-product-factory-vision-loop-subworkflow.json`
**Purpose:** Generate and refine Product Vision document through adversarial iteration

**Agents:**
| Agent | Model | Temperature | Memory | Purpose |
|-------|-------|-------------|--------|---------|
| Visionary | Claude 3.5 Sonnet | 0.7 | 8 messages | Create initial drafts |
| Critic | GPT-4o | 0.3 | 6 messages | Evaluate and score |
| Refiner | Claude 3.5 Sonnet | 0.5 | 10 messages | Improve based on feedback |

**Scoring Criteria (0-100 scale):**
- `problem_clarity` (15%) - Is the problem clearly defined?
- `value_prop_strength` (25%) - Is the value proposition compelling?
- `persona_depth` (15%) - Are personas specific with JTBD?
- `differentiation` (20%) - Is competitive advantage clear?
- `metrics_quality` (10%) - Are metrics SMART?
- `market_validation` (15%) - Is there market evidence?

**Node Flow:**
```
Subworkflow Entry Point → Loop State Initializer
    ↓
Visionary Agent ←─────────────────────────────────┐
    ↓                                              │
Draft State Updater                                │
    ↓                                              │
Critic Agent (with Perplexity Research Tool)       │
    ↓                                              │
Critic Response Parser                             │
    ↓                                              │
Quality Threshold Gate ──Score ≥ 90──→ Success Output Builder
    │ Score < 90                              ↓
    ↓                                    Subworkflow Output
Iteration Limit Gate ──Max Reached──→ Circuit Breaker Prep
    │ Not Reached                             ↓
    ↓                                   Wait for Human Guidance
Store State Before Refiner                    ↓
    ↓                                   Process Human Response
Refiner Agent                                 ↓
    ↓                                   Continue Loop?
Refiner State Updater ────────────────────────┘
    │ (loops back to Critic)
```

---

### 4. AI Product Factory - Architecture Adversarial Loop

**File:** `ai-product-factory-architecture-loop-subworkflow.json`
**Purpose:** Generate ARC42 architecture document with pre-mortem risk analysis

**Agents:**
| Agent | Model | Temperature | Memory | Purpose |
|-------|-------|-------------|--------|---------|
| Architect | Claude 3.5 Sonnet | 0.5 | 10 messages | Design ARC42 architecture |
| Dr. Doom | GPT-4o | 0.2 | - | Pre-mortem risk analysis |
| Fixer | Perplexity Sonar | 0.4 | - | Research risk mitigations |
| Refiner | Claude 3.5 Sonnet | 0.5 | 10 messages | Apply fixes |

**Tech Stack Enforcement:**
- Architect MUST use only approved technologies
- Dr. Doom checks for tech stack violations
- Violations flagged as `REQUIRES_APPROVAL`

**Node Flow:**
```
Subworkflow Entry Point → Loop State Initializer
    ↓
Load Tech Stack from Graphiti → Merge Tech Stack
    ↓
Architect Agent ←─────────────────────────────────────────┐
    ↓                                                      │
Draft State Updater                                        │
    ↓                                                      │
Dr. Doom Validator Agent                                   │
    ↓                                                      │
Risk Parser                                                │
    ↓                                                      │
Risks Need Research? ──Yes──→ Split Risks for Research    │
    │ No                           ↓                       │
    ↓                        Fixer Research Agent          │
    │                              ↓                       │
    │                        Aggregate Research Results    │
    ↓                              ↓                       │
Merge Research Paths ←─────────────┘                       │
    ↓                                                      │
Quality Threshold Gate ──Score ≥ 90──→ Success Output     │
    │ Score < 90                                           │
    ↓                                                      │
Iteration Limit Gate ──Max Reached──→ Circuit Breaker     │
    │ Not Reached                                          │
    ↓                                                      │
Refiner Agent ─────────────────────────────────────────────┘
```

---

### 5. AI Product Factory - Perplexity Research Tool

**File:** `ai-product-factory-perplexity-research-subworkflow.json`
**Purpose:** Semantic research tool for fact-checking and risk mitigation

**Research Types:**
| Type | Purpose | System Prompt Focus |
|------|---------|---------------------|
| `fact_check` | Verify claims | TRUE/FALSE/PARTIALLY TRUE with sources |
| `market_research` | Market trends | Key players, trends, growth projections |
| `best_practices` | Industry standards | Implementations, pitfalls, trade-offs |
| `risk_mitigation` | Solve risks | Case studies, tools, frameworks |
| `competitive_analysis` | Competitor intel | Strengths, weaknesses, positioning |

**Node Flow:**
```
Subworkflow Entry Point → Input Validator
    ↓
Perplexity Research Agent (Perplexity Sonar)
    ↓
Parse Research Response → Subworkflow Output
```

---

### 6. AI Product Factory - Decision Logger

**File:** `ai-product-factory-decision-logger-subworkflow.json`
**Purpose:** Maintain complete audit trail in Google Drive

**Operations:**
| Operation | Purpose | Format |
|-----------|---------|--------|
| `log_decision` | Tech standard discoveries | Decision entry with metadata |
| `log_iteration` | Loop iteration records | Score, issues, action |
| `log_approval` | Human approval records | Item, scope, notes |
| `log_phase_start` | Phase lifecycle | Phase header |
| `log_phase_end` | Phase completion | Summary with metrics |

**Output Location:** `AI_Product_Factory/{Project}/decision_log.md`

---

### 7-11. Titan Subworkflows (Shared Infrastructure)

These subworkflows are shared between Titan and AI Product Factory:

**Titan - Graphiti Operations** (`titan-graphiti-subworkflow.json`)
- Operations: `add_episode`, `search_nodes`, `search_facts`, `create_collection`
- Stores: Technical standards, architectural decisions, project context

**Titan - Qdrant Operations** (`titan-qdrant-subworkflow.json`)
- Operations: `upsert`, `search`, `get`, `create_collection`
- Stores: Document embeddings for semantic search
- Embedding Model: `text-embedding-3-small` (OpenAI)

---

## Agent Configuration

### All Agents Summary

| Agent | Workflow | Model | Temp | Memory | Tools |
|-------|----------|-------|------|--------|-------|
| Scavenger | Scavenging | Claude 3.5 Sonnet | 0.2 | - | - |
| Visionary | Vision Loop | Claude 3.5 Sonnet | 0.7 | Zep (8) | Graphiti |
| Critic | Vision Loop | GPT-4o | 0.3 | Zep (6) | Perplexity |
| Refiner (Vision) | Vision Loop | Claude 3.5 Sonnet | 0.5 | Zep (10) | Graphiti |
| Architect | Arch Loop | Claude 3.5 Sonnet | 0.5 | Zep (10) | Graphiti |
| Dr. Doom | Arch Loop | GPT-4o | 0.2 | - | - |
| Fixer | Arch Loop | Perplexity Sonar | 0.4 | - | - |
| Refiner (Arch) | Arch Loop | Claude 3.5 Sonnet | 0.5 | Zep (10) | Graphiti |
| Perplexity | Research Tool | Perplexity Sonar | 0.4 | - | - |

---

## Requirements Compliance

### Core Requirements Verification

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **Multiple Projects** | ✅ Met | Each project has isolated folder `AI_Product_Factory/{ProjectName}/` with own `project_state.json` |
| **Iterative Updates** | ✅ Met | Adversarial loops (Visionary→Critic→Refiner) iterate until score ≥ 90 or max iterations |
| **Shared Global Tech Stack** | ✅ Met | Standards stored in Graphiti `global_standards` group, enforced by Architect |
| **Tech Stack Evolution** | ✅ Met | Human governance approves each new standard as Global or Local via webhook |
| **Resumability** | ✅ Met | Smart Start detects "Resume", loads `project_state.json`, continues from saved phase |
| **Paper Trail** | ✅ Met | Decision Logger creates `decision_log.md` with all decisions, iterations, approvals |

### Governance Flow

```
New Tech Standard Found
         ↓
Check if exists in Graphiti (global_standards)
         ↓
    ┌────┴────┐
    │ Exists  │ → Skip (already approved)
    │ New     │ ↓
    └─────────┘
         ↓
Present to User:
"**PostgreSQL** (technology)
- Category: database
- Source: architecture-decisions.md
- Confidence: 95%

Is this a Global Standard or Local Standard?"
         ↓
Wait for webhook response { "scope": "global|local|skip" }
         ↓
    ┌────────────────┬────────────────┐
    │ global         │ local          │ skip
    ↓                ↓                ↓
Store in:          Store in:       Do not store
- Graphiti         - Graphiti
  (global_standards) (project_id)
- Qdrant           - Qdrant
  (scope: global)    (scope: local)
```

### Tech Stack Enforcement in Architecture

The Architect agent receives strict instructions:

```
## STRICT CONSTRAINT - TECH STACK COMPLIANCE
You MUST respect the Tech Stack defined in the provided standards.
DO NOT introduce new databases, frameworks, languages, or cloud services
that are not in the approved list.

If you believe a different technology is absolutely needed:
- Flag it as "REQUIRES_APPROVAL" in the Architecture Decisions section
- Explain why the approved option is insufficient
- Suggest the alternative with detailed justification
```

Dr. Doom validates compliance and reports violations:
```json
{
  "tech_stack_violations": [
    {
      "component": "Message Queue",
      "violation": "Used Kafka but only RabbitMQ is approved",
      "approved_alternative": "RabbitMQ"
    }
  ]
}
```

---

## Data Flow Diagrams

### State Persistence Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PROJECT STATE LIFECYCLE                          │
└─────────────────────────────────────────────────────────────────────┘

1. CREATION (New Project)
   ┌──────────────────────┐
   │ Create Initial State │
   │ {                    │
   │   project_name,      │
   │   current_phase: 0,  │
   │   tech_standards: {} │
   │ }                    │
   └──────────┬───────────┘
              ↓
   Google Drive: AI_Product_Factory/{Project}/project_state.json

2. UPDATES (After Each Phase)
   ┌──────────────────────┐
   │ Update State         │
   │ {                    │
   │   current_phase: N,  │
   │   phase_N_result,    │
   │   artifacts: {...}   │
   │ }                    │
   └──────────┬───────────┘
              ↓
   Overwrite project_state.json

3. RESUME (Existing Project)
   Google Drive: project_state.json
              ↓
   ┌──────────────────────┐
   │ Load & Parse State   │
   │ Resume from:         │
   │   current_phase      │
   └──────────────────────┘
```

### Knowledge Graph Flow (Graphiti)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GRAPHITI DATA FLOW                               │
└─────────────────────────────────────────────────────────────────────┘

WRITE (Phase 0 - Scavenging)
   Document → Scavenger Agent → Extracted Standard
              ↓
   User Approval (global/local)
              ↓
   ┌──────────────────────────────────┐
   │ Graphiti: add_episode            │
   │ - name: "Tech Standard: {name}"  │
   │ - content: JSON standard         │
   │ - group_id: "global_standards"   │
   │         OR "{project_id}"        │
   └──────────────────────────────────┘

READ (Phase 2 - Architecture)
   ┌──────────────────────────────────┐
   │ Graphiti: search_facts           │
   │ - query: "approved tech stack"   │
   │ - group_ids: ["global_standards",│
   │               "{project_id}"]    │
   └──────────────────────────────────┘
              ↓
   Merged Tech Stack → Architect Agent
```

---

## API Dependencies

### Required External Services

| Service | Purpose | Credential Name |
|---------|---------|-----------------|
| **OpenRouter** | LLM access (Claude, GPT-4o, Perplexity) | `OpenRouter API` |
| **Google Drive** | Document storage, state persistence | `Google Drive OAuth2` |
| **Graphiti** | Knowledge graph for tech standards | Environment: `GRAPHITI_URL` |
| **Qdrant** | Vector database for semantic search | Environment: `QDRANT_URL` |
| **Zep v3** | Agent conversation memory | `Zep Api account` |
| **OpenAI** | Embedding generation for Qdrant | `OpenAI API Header` |

### Environment Variables

```bash
# External Services
GRAPHITI_URL=http://graphiti:8000        # Knowledge graph
QDRANT_URL=http://qdrant:6333            # Vector database

# Workflow Configuration
FACTORY_MAX_ITERATIONS=5                  # Max adversarial loop iterations
FACTORY_SCORE_THRESHOLD=90               # Quality threshold (0-100)
FACTORY_BATCH_SIZE=3                     # Document batch size
FACTORY_CONFIRMATION_TIMEOUT=3600        # Webhook timeout (seconds)
```

---

## File Structure

### Final Repository Structure

```
curosr-n8n/
│
├── .mcp.json                         # MCP server configuration (git-ignored)
├── .gitignore                        # Git ignore rules
├── CLAUDE.md                         # Primary documentation & integration guide
├── IMPLEMENTATION_SUMMARY.md         # Implementation changelog
├── n8n-mcp-diagnosis.md             # MCP troubleshooting guide
│
├── .claude/
│   └── settings.local.json          # Claude Code settings (git-ignored)
│
├── .github/
│   └── copilot-instructions.md      # GitHub Copilot context
│
└── workflows/
    │
    ├── ## AI Product Factory (Primary System) ##
    │
    ├── ai-product-factory-main-workflow.json              # Main orchestrator
    ├── ai-product-factory-scavenging-subworkflow.json     # Phase 0: Context extraction
    ├── ai-product-factory-vision-loop-subworkflow.json    # Phase 1: Product Vision
    ├── ai-product-factory-architecture-loop-subworkflow.json  # Phase 2: Architecture
    ├── ai-product-factory-perplexity-research-subworkflow.json # Research tool
    ├── ai-product-factory-decision-logger-subworkflow.json     # Audit logging
    │
    ├── ## Titan Workflows (Shared Infrastructure) ##
    │
    ├── titan-main-workflow.json                # Legacy main orchestrator
    ├── titan-adversarial-loop-subworkflow.json # Legacy adversarial loop
    ├── titan-graphiti-subworkflow.json         # Knowledge graph operations
    ├── titan-qdrant-subworkflow.json           # Vector database operations
    ├── titan-paper-trail-packager-subworkflow.json # Iteration history packaging
    │
    └── ## Documentation ##
        │
        ├── WORKFLOW_DOCUMENTATION.md       # THIS FILE - Complete workflow docs
        ├── README.md                       # Setup and architecture overview
        └── TITAN_AGENT_PROMPTS.md          # Agent prompt templates
```

### Output Structure (Per Project)

```
AI_Product_Factory/
└── {ProjectName}/
    │
    ├── project_state.json              # Resumable state
    ├── decision_log.md                 # Complete paper trail
    │
    ├── Drafts/
    │   ├── ProductVision_FINAL.md      # Final Vision document
    │   └── Architecture_FINAL.md       # Final Architecture document
    │
    ├── Sessions/
    │   └── {Timestamp}/
    │       ├── Vision_v1.md
    │       ├── Vision_v1_critique.json
    │       ├── Vision_v2_FINAL.md
    │       ├── Architecture_v1.md
    │       └── Architecture_v2_FINAL.md
    │
    └── Standards/
        ├── global_standards.json       # Global tech stack reference
        └── local_standards.json        # Project-specific standards
```

---

## Quick Reference

### Workflow IDs for MCP Access

| Workflow | ID | Available in MCP |
|----------|-----|------------------|
| AI Product Factory - Main | `ai-product-factory-main` | Yes (Chat Trigger) |
| Context Scavenging | `ai-product-factory-scavenging` | No (Subworkflow) |
| Vision Loop | `ai-product-factory-vision-loop` | No (Subworkflow) |
| Architecture Loop | `ai-product-factory-architecture-loop` | No (Subworkflow) |
| Perplexity Research | `ai-product-factory-perplexity-research` | No (Subworkflow) |
| Decision Logger | `ai-product-factory-decision-logger` | No (Subworkflow) |

### Webhook Endpoints

| Purpose | Webhook Suffix | Expected Payload |
|---------|----------------|------------------|
| Tech Standard Approval | `tech_approval_{scavenging_id}_{index}` | `{ "scope": "global\|local\|skip" }` |
| Vision Circuit Breaker | `circuit_breaker_{loop_id}` | `{ "action": "accept\|guidance\|lower_threshold\|restart", "value": "..." }` |
| Arch Circuit Breaker | `arch_circuit_breaker_{loop_id}` | Same as Vision |

---

*Documentation generated: 2026-01-14*
*System Version: AI Product Factory v3.0.0*
