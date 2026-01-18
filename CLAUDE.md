# AI Product Factory - Claude Integration Guide

## Overview

The **AI Product Factory** (formerly Titan Workflow Suite) is a sophisticated n8n-based AI orchestration system that automatically generates comprehensive **Product Vision** and **Architecture** documents through multi-phase, collaborative AI agent workflows.

### What It Does

This system uses specialized AI agents working together to:
- Extract technical standards and decisions from existing documentation
- Create detailed Product Vision documents through iterative refinement
- Generate Architecture Vision documents with technical depth
- Validate and audit output quality through adversarial review
- Maintain knowledge graphs and vector embeddings for context retention

### Key Capabilities

- **Multi-Agent Collaboration**: 5 specialized AI agents (Scavenger, Creator, Critic, Refiner, Auditor)
- **Iterative Refinement**: Adversarial loops that improve output quality through multiple iterations
- **Knowledge Management**: Integration with Graphiti (knowledge graph) and Qdrant (vector database)
- **S3-Compatible Storage**: All artifacts and input documents stored in SeaweedFS (S3-compatible)
- **Drag-and-Drop Upload**: Browser-based file upload with presigned URLs
- **Batch Governance**: Generative UI for approving tech standards (Tech Stack Configurator)
- **Quality Assurance**: Built-in validation and scoring mechanisms
- **Cost Optimization**: Smart model selection (GPT-4 for reasoning, GPT-4o-mini for extraction)
- **Dashboard UI**: React-based dashboard with Google OAuth, ADR viewer, and artifact management
- **CI/CD Pipeline**: GitHub Actions for automated workflow sync and deployment
- **Observability**: Structured JSON logging with correlation IDs for distributed tracing
- **Resilient APIs**: Retry logic with exponential backoff and comprehensive error handling
- **Production Parity Testing**: Local environment that mirrors Dokploy deployment for pre-deployment validation
- **Auto-Bootstrap**: Automatic workflow import on first deployment with idempotent restart handling
- **Route Error Boundaries**: Graceful error handling with retry, navigation options, and dev-mode stack traces
- **Loading Skeletons**: Smooth route transitions with contextual skeleton loaders
- **Toast Notifications**: User feedback via Sonner for success/error states across all operations
- **Setup Wizard**: 6-step guided wizard for n8n integration configuration with workflow import and webhook detection
- **Integration Test Suite**: 79 integration tests + E2E tests covering complete workflow lifecycle

### Version

Current version: **v3.0.2** (2026-01-18)

---

## Architecture

### Workflow Structure

```mermaid
flowchart TB
    User[User Input] --> Main[Titan Main Orchestrator]

    subgraph Main Workflow
        Input[Input Validation] --> Phase0[Phase 0: Scavenger]
        Phase0 --> CP0[Checkpoint]
        CP0 --> Phase1[Phase 1: Vision Loop]
        Phase1 --> CP1[Checkpoint]
        CP1 --> Phase2[Phase 2: Architecture Loop]
        Phase2 --> Phase3[Phase 3: Audit]
        Phase3 --> Output[Final Output]
    end

    subgraph Subworkflows
        Loop[Adversarial Loop<br/>Creator → Critic → Refiner]
        Graph[Graphiti Operations<br/>Knowledge Graph]
        Qdrant[Qdrant Operations<br/>Vector Database]
    end

    Phase0 --> Graph
    Phase0 --> Qdrant
    Phase1 --> Loop
    Phase2 --> Loop

    style Main fill:#e1f5ff
    style Loop fill:#fff4e1
    style Graph fill:#f0e1ff
    style Qdrant fill:#e1ffe1
```

### Agent Descriptions

| Agent | Model | Temperature | Memory | Purpose |
|-------|-------|-------------|--------|---------|
| **Scavenger** | Claude Sonnet 3.5 | 0.2 | Simple (5 messages) | Extracts technical standards and decisions from documents |
| **Creator** | Claude Sonnet 3.5 | 0.7 | Window (8 messages) | Generates initial comprehensive drafts |
| **Critic** | Claude Sonnet 3.5 | 0.3 | Window (6 messages) | Evaluates drafts and provides scored feedback |
| **Refiner** | Claude Sonnet 3.5 | 0.5 | Window (10 messages) | Improves drafts based on critic feedback |
| **Auditor** | Claude Sonnet 3.5 | 0.2 | Simple | Final quality validation and compliance check |

> **Note**: All models are accessed via OpenRouter API (`anthropic/claude-sonnet-3.5`). Memory is managed by Zep v3.

### Workflow Phases

#### Phase 0: Scavenger (2-5 minutes)
- Scans uploaded documents from S3 storage
- Extracts technical standards, patterns, and decisions
- Presents batch governance UI for tech stack approval (Generative UI)
- Stores approved findings in Graphiti knowledge graph
- Generates embeddings and stores in Qdrant vector database

#### Phase 1: Vision Loop (5-15 minutes)
- **Creator** generates initial Product Vision document
- **Critic** evaluates and scores the draft (0-10)
- **Refiner** improves the document based on feedback
- Iterates up to 5 times or until score ≥ 9.0
- Maintains full iteration history

#### Phase 2: Architecture Loop (5-15 minutes)
- Same adversarial loop pattern as Phase 1
- Focuses on Architecture Vision document
- Leverages knowledge from Phase 1
- Uses Graphiti context for technical consistency

#### Phase 3: Audit (1-3 minutes)
- **Auditor** validates combined documentation
- Checks compliance with extracted standards
- Verifies technical accuracy
- Provides final quality score

**Total Duration**: 15-40 minutes per complete run

---

## MCP Integration Setup

### Prerequisites

Before configuring MCP integration, ensure:

1. ✅ Your n8n instance is running at `https://c3po.etrox.de`
2. ✅ MCP access is enabled in n8n (Settings → Instance-level MCP)
3. ✅ Titan workflows are imported and marked "Available in MCP"
4. ✅ All subworkflows are activated in n8n
5. ✅ Required credentials are configured (OpenAI, SeaweedFS/S3)

### MCP Configuration

To enable Claude to interact with your Titan workflows, add this configuration to your MCP settings file.

**Configuration Locations** (choose one):

- **Project-scoped** (recommended for teams): `.mcp.json` in your project root
  - Version-controlled and shared with team
  - Only active when working in this project

- **User-scoped** (recommended for personal use): `~/.claude.json` (Mac/Linux) or `%USERPROFILE%\.claude.json` (Windows)
  - Available across all your projects
  - Personal configuration

**Note**: Some older documentation may reference `~/.cursor/mcp.json` or `~/.claude/settings.json`, but these locations are for Cursor IDE and are not used by Claude Code CLI. See [Claude Code Configuration Guide](https://scottspence.com/posts/configuring-mcp-tools-in-claude-code) and [Claude Code Settings Docs](https://code.claude.com/docs/en/settings) for more details.

### Available MCP Servers

The configuration below includes multiple MCP servers to enhance Claude's capabilities:

| Server | Purpose | Key Features |
|--------|---------|--------------|
| **n8n-mcp** | Execute Titan workflows | Run document generation workflows, query knowledge graph, search vector database |
| **context7** | Codebase understanding | Deep code analysis, architecture visualization, semantic search |
| **Playwright** | Browser automation | Web scraping, UI testing, automated browser interactions |
| **firecrawl-mcp** | Web crawling | Advanced web scraping with JavaScript rendering, sitemap crawling |
| **exa** | AI-powered search | Semantic web search, research assistance, content discovery |
| **perplexity** | AI research | Real-time web search with AI summarization |
| **Ref** | API documentation | Quick access to API references and documentation |
| **semgrep** | Code security | Static analysis, security vulnerability scanning |
| **shadcn** | UI components | shadcn/ui component integration and management |

```json
{
  "mcpServers": {
    "context7": {
      "url": "https://mcp.context7.com/mcp"
    },
    "Playwright": {
      "command": "npx @playwright/mcp@latest",
      "env": {}
    },
    "firecrawl-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "firecrawl-mcp"
      ],
      "env": {
        "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}"
      }
    },
    "exa": {
      "command": "npx",
      "args": [
        "-y",
        "exa-mcp-server"
      ],
      "env": {
        "EXA_API_KEY": "${EXA_API_KEY}"
      }
    },
    "perplexity": {
      "command": "npx",
      "args": [
        "-y",
        "@perplexity-ai/mcp-server"
      ],
      "env": {
        "PERPLEXITY_API_KEY": "${PERPLEXITY_API_KEY}"
      }
    },
    "Ref": {
      "type": "http",
      "url": "https://api.ref.tools/mcp?apiKey=${REF_API_KEY}"
    },
    "semgrep": {
      "type": "streamable-http",
      "url": "https://mcp.semgrep.ai/mcp"
    },
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    },
    "n8n-mcp": {
      "command": "npx",
      "args": ["n8n-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true",
        "N8N_API_URL": "https://c3po.etrox.de",
        "N8N_API_KEY": "${N8N_API_KEY}"
      }
    }
  }
}
```

> **Note**: Replace `${VARIABLE_NAME}` placeholders with your actual API keys. Store these in your `.mcp.json` file (which is gitignored) or use environment variables.

### Activation Steps

#### Option 1: Using Claude CLI (Recommended)

```bash
# Add n8n MCP server to user scope (available in all projects)
claude mcp add

# Or add to project scope (only this project)
claude mcp add --scope project
```

Then provide these details when prompted:
- **Server name**: `n8n-mcp`
- **Command**: `npx`
- **Args**: `-y supergateway --streamableHttp https://c3po.etrox.de/mcp-server/http --header "authorization:Bearer YOUR_TOKEN"`

#### Option 2: Manual Configuration

**For Project Scope** (recommended for this repository):

1. **Create `.mcp.json` in project root**:
   ```bash
   # Windows PowerShell (from project root)
   cd C:\Users\180-1\Documents\workspace\curosr-n8n
   notepad .mcp.json
   ```

2. **Paste the configuration** (shown above in MCP Configuration section)

3. **Save the file**

   **⚠️ IMPORTANT**: The `.mcp.json` file contains sensitive API keys. A `.gitignore` file has been created to exclude it from version control. Do NOT commit this file to git.

**For User Scope** (available in all projects):

1. **Create/Edit `~/.claude.json`**:
   ```powershell
   # Windows PowerShell
   notepad $env:USERPROFILE\.claude.json
   ```

2. **Add the `mcpServers` section** to your existing config, or create new file with the configuration shown above

3. **Save and close** the file

**After Configuration**:

4. **Restart Claude Code** completely (close all sessions)

5. **Verify Connection**:
   - Start a new conversation with Claude
   - Ask: "What n8n workflows are available?"
   - Claude should list the Titan workflows

### Verification

To test the MCP connection is working:

```powershell
# Test n8n instance accessibility
Invoke-WebRequest -Uri "https://c3po.etrox.de" -Method GET

# Test MCP endpoint (should return workflow list)
# Replace $env:N8N_API_KEY with your actual n8n API token
$headers = @{
    "authorization" = "Bearer $env:N8N_API_KEY"
    "Content-Type" = "application/json"
}
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
Invoke-WebRequest -Uri "https://c3po.etrox.de/mcp-server/http" -Method POST -Headers $headers -Body $body
```

---

## Available Workflows

### 1. Titan - Main Orchestrator

**Purpose**: Complete end-to-end document generation workflow

**Workflow ID**: `titan-main-workflow`

**Input Parameters**:
```json
{
  "project_id": "string",           // Unique identifier for your project
  "project_name": "string",         // Human-readable project name
  "description": "string",          // Brief project description (optional but recommended)
  "input_files": [                  // Array of uploaded files (from S3)
    {
      "key": "string",              // S3 object key
      "name": "string",             // Original filename
      "size": "number",             // File size in bytes
      "content_type": "string"      // MIME type
    }
  ]
}
```

**Example Input**:
```json
{
  "project_id": "myapp-2026",
  "project_name": "MyApp Platform",
  "description": "A real-time collaboration platform for remote teams",
  "input_files": [
    { "key": "projects/myapp-2026/input/architecture.md", "name": "architecture.md", "size": 15420, "content_type": "text/markdown" },
    { "key": "projects/myapp-2026/input/requirements.pdf", "name": "requirements.pdf", "size": 245000, "content_type": "application/pdf" }
  ]
}
```

**Output**:
- Complete Product Vision document
- Complete Architecture Vision document
- Extracted technical standards
- Quality scores and validation results
- Full telemetry data (timing, iterations, costs)

**Expected Duration**: 15-40 minutes

### 2. Titan - Adversarial Agent Loop (Subworkflow)

**Purpose**: Iterative document refinement using Creator → Critic → Refiner pattern

**Workflow ID**: `titan-adversarial-loop-subworkflow`

**Input Parameters**:
```json
{
  "document_type": "string",        // "vision" or "architecture"
  "context": "string",               // Background information and requirements
  "technical_standards": "string"    // Extracted standards to follow
}
```

**Output**:
- Refined document content
- Quality score (0-10)
- Iteration history
- Final critique and recommendations

**Expected Duration**: 5-15 minutes (2-5 iterations)

### 3. Titan - Graphiti Operations (Subworkflow)

**Purpose**: Knowledge graph operations for storing and retrieving technical context

**Workflow ID**: `titan-graphiti-subworkflow`

**Operations**:
- `add_episode`: Store new content in knowledge graph
- `search_nodes`: Find relevant technical standards
- `search_facts`: Query specific technical decisions
- `create_collection`: Initialize new knowledge repositories

**Expected Duration**: 2-10 seconds per operation

### 4. Titan - Qdrant Operations (Subworkflow)

**Purpose**: Vector database operations for semantic document search

**Workflow ID**: `titan-qdrant-subworkflow`

**Operations**:
- `upsert`: Store document embeddings with metadata
- `search`: Semantic similarity search across documents
- `get`: Retrieve specific document points
- `create_collection`: Initialize new vector collections

**Expected Duration**: 1-5 seconds per operation

---

## Using Titan with Claude

### Basic Usage

Once MCP is configured, you can interact with Titan workflows naturally through conversation:

#### Example 1: Full Document Generation

```
You: "I need to generate product and architecture documentation for my new
e-commerce platform called 'ShopFast'."

Claude: "Great! Please go to the Dashboard and create a new project:
1. Click 'New Project' on the Projects page
2. Enter project name 'ShopFast'
3. Drag and drop your source documents (architecture docs, requirements, etc.)
4. Click 'Start Project'

The workflow will automatically begin processing your documents."
```

#### Example 2: Quick Vision Document

```
You: "Create just a Product Vision document for a mobile fitness app.
Use the standards we've already extracted."

Claude: [Executes titan-adversarial-loop-subworkflow for vision document]
[Returns refined vision document after 5-10 minutes]
```

#### Example 3: Search Technical Standards

```
You: "What authentication patterns are stored in our knowledge graph?"

Claude: [Executes titan-graphiti-subworkflow with search_facts operation]
[Returns relevant authentication patterns and decisions]
```

### Advanced Usage Patterns

#### Monitoring Long-Running Workflows

```
You: "Start the full Titan workflow for project 'Alpha'. Let me know
when each phase completes."

Claude: [Starts workflow and provides status updates]
- Phase 0: Scavenger completed (3 minutes)
- Phase 1: Vision Loop completed (8 minutes, 3 iterations, score 9.2)
- Phase 2: Architecture Loop in progress...
```

#### Querying Context During Execution

```
You: "While that runs, what technical standards did the Scavenger find?"

Claude: [Queries Graphiti for extracted standards while main workflow continues]
```

#### Custom Parameters

```
You: "Run Titan for project 'Beta' with focus on microservices architecture
and event-driven patterns."

Claude: [Includes your architectural preferences in the workflow input]
```

### Best Practices

1. **Provide Clear Project Context**: The more detail you give about your project, the better the output quality
2. **Use Descriptive Project Names**: Makes it easier to track and reference later
3. **Upload Quality Documents**: Include architecture docs, requirements, and technical standards
4. **Monitor Costs**: Each full run costs $1.50-$3.00 in OpenAI API usage
5. **Review Intermediate Outputs**: Check Scavenger results before continuing to ensure accurate standard extraction
6. **Iterate on Results**: Use the Adversarial Loop directly to refine specific sections

### Combining MCP Capabilities

You can leverage multiple MCP servers together for enhanced workflows:

**Enhanced Document Generation**:
```
You: "Use Exa to research best practices for microservices architecture,
then use that research as context for generating an Architecture Vision
document using the Titan workflow for project 'MicroserviceApp'."
```

**Security-Enhanced Workflow**:
```
You: "After generating the architecture document, use Semgrep to scan
the codebase for security vulnerabilities and include findings in the
technical standards."
```

**Web Research Integration**:
```
You: "Use Firecrawl to extract technical documentation from [company website],
store it in the Titan knowledge graph, then generate architecture docs
that align with their standards."
```

**Automated Testing Integration**:
```
You: "Generate the product vision using Titan, then use Playwright to
create automated UI tests based on the documented user flows."
```

---

## Perplexity MCP Best Practices

Perplexity is a core research component of the AI Product Factory, providing real-time web search with AI summarization. This section covers best practices for using Perplexity MCP effectively within this project.

**Why Perplexity?** Unlike static knowledge cutoffs in LLMs, Perplexity searches the live web, providing up-to-date information for fact-checking, market research, and technology evaluation. This is critical for generating accurate Product Vision and Architecture documents.

### Understanding Perplexity's Role

Perplexity serves three primary functions in this project:

| Function | Phase | Agent | Purpose |
|----------|-------|-------|---------|
| **Fact-checking** | Phase 1 (Vision) | Critic | Verify market claims and statistics |
| **Risk research** | Phase 2 (Architecture) | Fixer | Find mitigation strategies for identified risks |
| **Tech enrichment** | Phase 0 (Scavenging) | Research Tool | Discover alternatives to detected technologies |

### Research Types and When to Use Them

The Perplexity Research subworkflow supports five research types. Choose the appropriate type for your query:

```
fact_check        → Verify claims with supporting evidence and citations
market_research   → Analyze market trends, key players, growth projections
best_practices    → Industry best practices with implementation examples
risk_mitigation   → Proven mitigation strategies and case studies
competitive_analysis → Competitor intelligence and market positioning
```

#### Usage Examples

**Fact-checking a claim**:
```
You: "Use Perplexity to fact-check: 'The global SaaS market is projected
to reach $700 billion by 2030'"

Claude: [Uses Perplexity with research_type: "fact_check"]
Returns: Verified claim with 3-5 authoritative sources
```

**Researching risk mitigation**:
```
You: "Use Perplexity to research mitigation strategies for
microservices data consistency challenges"

Claude: [Uses Perplexity with research_type: "risk_mitigation"]
Returns: Saga pattern, event sourcing, CQRS with case studies
```

**Finding technology alternatives**:
```
You: "Use Perplexity to find alternatives to PostgreSQL for
a high-write event streaming use case"

Claude: [Uses Perplexity with research_type: "best_practices"]
Returns: TimescaleDB, ClickHouse, Apache Kafka with pros/cons
```

### Best Practices for Effective Queries

#### 1. Be Specific and Contextual

**Good**:
```
"Research best practices for implementing OAuth 2.0 with PKCE
in a React SPA with Node.js backend"
```

**Poor**:
```
"Research authentication"
```

#### 2. Include Constraints

**Good**:
```
"Find risk mitigation strategies for Kubernetes pod autoscaling
in AWS EKS with cost constraints under $5000/month"
```

**Poor**:
```
"How to scale Kubernetes"
```

#### 3. Request Specific Deliverables

**Good**:
```
"Provide 3 alternative message queue solutions to RabbitMQ,
comparing throughput, latency, and operational complexity"
```

**Poor**:
```
"What's better than RabbitMQ"
```

### Combining Perplexity with Project Workflows

#### Pre-Research Before Vision Generation

Before starting a Titan workflow, use Perplexity to gather market context:

```
You: "Before generating documentation for my fintech startup:
1. Use Perplexity to research current fintech regulatory trends in EU
2. Use Perplexity to find best practices for PSD2 compliance
3. Then start the Titan workflow with this research as context"

Claude: [Executes Perplexity research, then includes findings in Titan input]
```

#### Validate Architecture Decisions

After generating architecture documentation, validate key decisions:

```
You: "The architecture document recommends Apache Kafka for event streaming.
Use Perplexity to:
1. Verify this is still the industry best practice for our scale (10K events/sec)
2. Research any emerging alternatives we should consider
3. Find case studies of similar implementations"
```

#### Enrich Tech Stack Governance

During Phase 0, Perplexity automatically enriches detected technologies with alternatives. You can also manually request deeper research:

```
You: "The Scavenger found we're using MongoDB. Use Perplexity to research:
1. When MongoDB is the right choice vs alternatives
2. Common scaling challenges at 100GB+ data volumes
3. Best practices for MongoDB in a microservices architecture"
```

### Rate Limiting and Cost Optimization

Perplexity API calls are rate-limited. Follow these practices:

1. **Batch related queries**: Combine multiple related questions into one request
2. **Cache results**: Perplexity findings are stored in the knowledge graph for reuse
3. **Use appropriate depth**: Not every claim needs fact-checking - prioritize critical assertions
4. **Leverage workflow integration**: Let the automated workflow handle routine research

**Cost-conscious querying**:
```
# Instead of 5 separate queries:
"Research authentication best practices"
"Research JWT vs sessions"
"Research OAuth providers"
"Research MFA implementation"
"Research password policies"

# Use one comprehensive query:
"Research authentication best practices for a B2B SaaS application,
covering: JWT vs sessions trade-offs, recommended OAuth providers,
MFA implementation patterns, and password policy standards. Include
specific recommendations for a React/Node.js stack."
```

### Integrating Results with Knowledge Graph

Perplexity research can be stored in Graphiti for future reference:

```
You: "Research microservices communication patterns and store the findings
in the knowledge graph for project 'MicroserviceApp'"

Claude: [Executes Perplexity research]
[Stores findings in Graphiti with project scope]
[Future Vision/Architecture generation will use this context]
```

### Troubleshooting Perplexity Issues

#### Problem: "Perplexity rate limit exceeded"

**Solution**: The workflow includes a 1-second delay between calls. If you're making manual queries, space them out:
```
# Wait between queries
You: "Use Perplexity to research X" [wait 2 seconds]
You: "Use Perplexity to research Y"
```

#### Problem: "Research results seem outdated"

**Solution**: Perplexity searches the live web, but results depend on query specificity:
```
# Add temporal context
"Research React 19 best practices (2025-2026)"
"What are the current (January 2026) alternatives to Terraform"
```

#### Problem: "Sources not returned"

**Solution**: The response parsing expects URLs in a specific format. If sources are missing:
1. Check the raw response in workflow execution logs
2. URLs are extracted via regex: `https?://[^\s)]+`
3. Ensure the Perplexity model is returning properly formatted responses

### Security Considerations for Perplexity

1. **API Key Protection**: Store `PERPLEXITY_API_KEY` in environment variables, never in code
2. **Query Sanitization**: Don't include sensitive data (passwords, API keys) in research queries
3. **Result Validation**: Perplexity results are AI-generated summaries - verify critical claims
4. **Rate Monitoring**: Set up billing alerts on your Perplexity account

### Advanced: Custom Research Workflows

For project-specific research needs, you can extend the Perplexity Research subworkflow:

```javascript
// Example: Add custom research type in the Input Validator node
const researchTypes = {
  // Existing types...
  'compliance_check': {
    prefix: 'Research compliance requirements for',
    suffix: 'Include specific regulations, certifications needed, and implementation timelines.'
  },
  'cost_analysis': {
    prefix: 'Analyze cost implications of',
    suffix: 'Include TCO estimates, hidden costs, and cost optimization strategies.'
  }
};
```

### Quick Reference: Perplexity Commands

```
# Fact-checking
"Use Perplexity to fact-check: [claim]"

# Market research
"Use Perplexity to research market trends for [industry/technology]"

# Best practices
"Use Perplexity to find best practices for [topic] in [context]"

# Risk mitigation
"Use Perplexity to research mitigation strategies for [risk]"

# Competitive analysis
"Use Perplexity to analyze competitors in [market segment]"

# Technology comparison
"Use Perplexity to compare [tech A] vs [tech B] for [use case]"
```

### Research-Driven Project Development

Use Perplexity systematically throughout the AI Product Factory workflow:

#### Before Starting a Project

Research the domain and competitive landscape:

```
You: "I'm about to start a project for a healthcare scheduling app.
Use Perplexity to research:
1. Current healthcare tech trends (2025-2026)
2. HIPAA compliance requirements for scheduling apps
3. Existing solutions and their limitations
4. Best practices for healthcare UX design"

Claude: [Executes 4 Perplexity queries]
[Returns comprehensive research summary]
[This context will improve Vision document quality]
```

#### During Tech Governance (Phase 0)

When the Scavenger finds technologies, validate with Perplexity:

```
You: "The Scavenger found we're using Redis for caching.
Use Perplexity to research:
1. Redis vs alternatives (Memcached, Valkey) for session caching
2. Redis clustering best practices for high availability
3. Common Redis scaling pitfalls in production"

Claude: [Returns comparison and recommendations]
[Helps make informed governance decisions]
```

#### During Architecture Design (Phase 2)

Validate architectural decisions with industry research:

```
You: "The Architect is recommending a microservices pattern.
Use Perplexity to research:
1. When monolith-to-microservices migration makes sense
2. Inter-service communication patterns (gRPC vs REST vs messaging)
3. Case studies of similar-scale microservices implementations
4. Common microservices anti-patterns to avoid"
```

#### After Document Generation

Verify key claims in the final documents:

```
You: "The Product Vision claims our TAM is $50B. Use Perplexity to:
1. Fact-check this market size claim
2. Find the most recent industry reports
3. Identify the source methodology for market sizing"
```

### Perplexity for Continuous Improvement

Use Perplexity to improve the AI Product Factory itself:

```
# Research new patterns
"Use Perplexity to research the latest multi-agent orchestration
patterns in 2026, focusing on improvements over supervisor pattern"

# Find optimization strategies
"Use Perplexity to research token optimization strategies for
LLM workflows, focusing on context window management"

# Evaluate new models
"Use Perplexity to compare Claude Sonnet 3.5 vs Claude Opus 4.5
for document generation tasks, including cost and quality tradeoffs"

# Discover tooling improvements
"Use Perplexity to research n8n workflow best practices in 2026,
focusing on AI agent nodes and memory management"
```

---

## Best Practices for AI Product Factory

This section consolidates industry best practices for multi-agent AI orchestration systems, informed by research from [n8n's production deployment guide](https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/), [Microsoft's AI Agent Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns), and [Google's Multi-Agent Patterns Guide](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/).

### Multi-Agent Orchestration Patterns

The AI Product Factory implements a **Supervisor Pattern** with **Sequential Pipeline** elements. Understanding these patterns helps optimize your workflows.

#### Pattern Selection Guide

| Pattern | When to Use | AI Product Factory Usage |
|---------|-------------|--------------------------|
| **Supervisor/Centralized** | Strict governance, compliance, reliability | Main Orchestrator coordinates all phases |
| **Sequential Pipeline** | Ordered data processing, dependent steps | Phase 0 → Phase 1 → Phase 2 → Audit |
| **Generator-Critic** | High-quality output requiring validation | Creator → Critic → Refiner loop |
| **Event-Driven** | High scalability, loose coupling | Webhook triggers, async processing |

**Reference**: [Choosing the Right Orchestration Pattern](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems)

#### Best Practices for Multi-Agent Systems

1. **Isolate Agent Failures**: Design agents to fail independently without cascading
   ```
   ✅ Each agent has its own error handler (Error Trigger nodes added in v2.8.0)
   ✅ Circuit breakers prevent infinite loops after 5 iterations
   ✅ State persists between failures for resumability
   ```

2. **Surface Errors Explicitly**: Don't hide errors from downstream agents
   ```
   ✅ Critic returns structured feedback, not silent failures
   ✅ Dr. Doom explicitly flags risks for Fixer to address
   ✅ Decision log captures all errors and recovery actions
   ```

3. **Minimize Token Consumption**: Different patterns vary by 200%+ in token usage
   ```
   ✅ Context windows are bounded (5-10 messages per agent)
   ✅ Only relevant context passed between phases
   ✅ Embeddings used for semantic retrieval vs. full documents
   ```

### Adversarial Loop Best Practices

The Generator-Critic pattern is central to AI Product Factory's quality assurance. Based on [Google's LoopAgent research](https://medium.com/google-developer-experts/build-ai-agents-that-self-correct-until-its-right-adk-loopagent-f620bf351462):

#### When Loops Work Best

Adversarial loops are effective when:
- **Quality is measurable**: The Critic can score output objectively (0-100 scale)
- **Refinement is possible**: The Refiner has actionable context to improve
- **Exit conditions are clear**: Score threshold (≥90) provides unambiguous termination

#### When to Avoid Loops

- **Latency-critical scenarios**: If you need sub-200ms responses
- **Vague criteria**: "If the Validator can't clearly articulate why it failed, the Generator will just spin in circles"
- **Diminishing returns**: After 3 iterations, improvements typically plateau

#### AI Product Factory Loop Configuration

```bash
# Recommended settings (balanced quality/speed)
FACTORY_MAX_ITERATIONS=5              # Circuit breaker
FACTORY_SCORE_THRESHOLD=90            # Exit when good enough
FACTORY_MEMORY_CRITIC=6               # Limited context for focused critique

# High-quality settings (slower, more iterations)
FACTORY_MAX_ITERATIONS=7
FACTORY_SCORE_THRESHOLD=95

# Fast settings (fewer iterations, accept lower quality)
FACTORY_MAX_ITERATIONS=3
FACTORY_SCORE_THRESHOLD=85
```

#### Implementing Effective Critics

Based on [AI Agent Prompting Best Practices](https://medium.com/automation-labs/ai-agent-prompting-for-n8n-the-best-practices-that-actually-work-in-2025-8511c5c16294):

1. **Use structured scoring rubrics**: The Critic evaluates against specific dimensions
2. **Provide actionable feedback**: "Section 3.2 lacks technical depth" > "Could be better"
3. **Include improvement suggestions**: Guide the Refiner with concrete recommendations
4. **Set appropriate temperatures**: Low (0.2-0.3) for consistent, objective critique

### Context Engineering Over Prompt Engineering

According to [Anthropic's research](https://blog.n8n.io/llm-agents/), in 2025-2026, it's no longer "prompt engineering" that matters—it's **context engineering**:

> "The question is no longer 'how do I craft the perfect prompt,' but 'which configuration of context leads to the desired behavior.'"

#### Context Engineering in AI Product Factory

| Context Source | How It's Used | Best Practice |
|----------------|---------------|---------------|
| **Knowledge Graph (Graphiti)** | Technical standards, decisions | Store globally-approved patterns |
| **Vector DB (Qdrant)** | Semantic document search | Embed all input documents |
| **Iteration History** | Previous drafts and critiques | Pass to Refiner for improvement |
| **Perplexity Research** | Real-time web knowledge | Fact-check critical claims |

#### Optimizing Context Windows

```javascript
// n8n Memory Configuration Best Practices
{
  "visionary": {
    "memoryType": "window",
    "windowSize": 8,           // Creative agent needs more context
    "reason": "Needs full project context for coherent vision"
  },
  "critic": {
    "memoryType": "window",
    "windowSize": 6,           // Analytical agent needs less
    "reason": "Focus on current document vs. history"
  },
  "scavenger": {
    "memoryType": "simple",
    "windowSize": 5,           // Extraction is stateless
    "reason": "Each document processed independently"
  }
}
```

### Production Deployment Best Practices

Based on [n8n's 15 Best Practices for Production AI Agents](https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/):

#### Infrastructure Phase

1. **Choose deployment model wisely**:
   - Self-hosted (Docker): Full control, requires maintenance
   - n8n Cloud: Managed, less operational burden
   - Hybrid: n8n Cloud + self-hosted Qdrant/Graphiti

2. **Enable Queue Mode for scalability**:
   ```yaml
   # docker-compose.yml
   n8n:
     environment:
       - EXECUTIONS_MODE=queue
       - QUEUE_BULL_REDIS_HOST=redis
   ```

3. **Configure proper resource limits**:
   ```yaml
   n8n:
     deploy:
       resources:
         limits:
           memory: 4G
         reservations:
           memory: 2G
   ```

#### Development Phase

4. **Start simple, add complexity iteratively**:
   - Begin with single-agent workflows
   - Add adversarial loops after base works
   - Integrate knowledge graph last

5. **Use modular, reusable subworkflows**:
   ```
   ✅ titan-graphiti-subworkflow.json    (reusable knowledge ops)
   ✅ titan-qdrant-subworkflow.json      (reusable vector ops)
   ✅ ai-product-factory-s3-subworkflow.json  (reusable storage ops)
   ```

6. **Implement comprehensive error handling**:
   - Error Trigger nodes on all critical paths (added v2.8.0)
   - Retry logic with exponential backoff for S3/API calls
   - Graceful degradation when services unavailable

#### Pre-Deployment Phase

7. **Test with real-world scenarios**:
   - Run integration tests: `npm run test:integration`
   - Test with various document types (PDF, MD, DOCX)
   - Verify edge cases (empty docs, huge files, malformed input)

8. **Monitor token usage before going live**:
   ```
   Average tokens per run: ~150K
   Cost per run: ~$0.10-0.15
   Set billing alerts at: $50/day
   ```

#### Deployment Phase

9. **Use CI/CD for workflow synchronization**:
   ```bash
   # Automated via GitHub Actions
   npm run sync-workflows           # Push local → n8n
   npm run sync-workflows:dry-run   # Preview changes
   ```

10. **Enable health checks**:
    ```bash
    # Dashboard health endpoint
    curl https://dashboard.example.com/api/health

    # n8n health check
    curl https://n8n.example.com/healthz
    ```

#### Maintenance Phase

11. **Monitor execution logs regularly**:
    - Check iteration counts (>5 suggests prompt issues)
    - Monitor quality scores (consistent <80 needs investigation)
    - Track execution times (>45 min indicates bottlenecks)

12. **Implement graceful retirement**:
    - Archive old projects to cold storage
    - Clean up Qdrant collections periodically
    - Prune knowledge graph of outdated standards

### Human-in-the-Loop Best Practices

Based on [Event-Driven Multi-Agent Systems](https://www.confluent.io/blog/event-driven-multi-agent-systems/):

> "Trustworthy AI systems combine deterministic workflows, probabilistic models, and human oversight. Automation ensures control, AI handles complexity, and humans own risk, edge cases, and final responsibility."

#### When to Require Human Approval

| Scenario | Human Required | AI Product Factory Implementation |
|----------|----------------|-----------------------------------|
| **Tech stack decisions** | ✅ Yes | Batch Governance UI in Phase 0 |
| **Final document approval** | ✅ Yes | Audit phase + manual review |
| **Iteration limit reached** | ✅ Yes | Circuit breaker prompts for guidance |
| **Individual critique scores** | ❌ No | Automated loop continuation |
| **Intermediate drafts** | ❌ No | Stored for audit, not reviewed |

#### Best Practices for Human Checkpoints

1. **Batch decisions when possible**: The Tech Stack Configurator allows approving multiple technologies at once
2. **Provide context for decisions**: Show confidence scores, alternatives, source documents
3. **Set reasonable timeouts**: `FACTORY_CONFIRMATION_TIMEOUT=3600` (1 hour default)
4. **Allow async continuation**: State persists for resume after human decision

### Error Handling & Resilience

Based on [Agent Orchestration Best Practices](https://videosdk.live/developer-hub/ai_agent/agent-orchestration):

#### Retry Configuration

```javascript
// S3 operations (added v2.8.0)
{
  "retryCount": 3,
  "retryDelay": 1000,        // 1 second
  "retryBackoff": true       // Exponential backoff
}

// API calls to LLMs
{
  "retryCount": 2,
  "retryDelay": 5000,        // 5 seconds (rate limit recovery)
  "retryBackoff": false      // Fixed delay for rate limits
}
```

#### Circuit Breaker Pattern

```
After 5 iterations without meeting threshold:
1. Log current state and scores
2. Prompt human for guidance
3. Options: accept, provide feedback, lower threshold, restart
4. Never spin indefinitely
```

#### Graceful Degradation

| Service Down | Fallback Behavior |
|--------------|-------------------|
| **Graphiti** | Continue without knowledge graph enrichment |
| **Qdrant** | Skip semantic search, use keyword matching |
| **Perplexity** | Skip fact-checking, mark claims as unverified |
| **S3** | Fail workflow (critical dependency) |

### Cost Optimization Strategies

Based on the [n8n AI Capabilities Review](https://latenode.com/blog/low-code-no-code-platforms/n8n-setup-workflows-self-hosting-templates/n8n-ai-agents-2025-complete-capabilities-review-implementation-reality-check):

#### Model Selection by Task

| Task Type | Recommended Model | Cost Impact |
|-----------|-------------------|-------------|
| **Creative generation** | Claude Sonnet 3.5 | Base cost |
| **Critique/Analysis** | GPT-4o | Similar to Sonnet |
| **Extraction** | GPT-4o-mini | 90% cheaper |
| **Embeddings** | text-embedding-3-small | Minimal |
| **Research** | Perplexity Sonar | Per-query pricing |

#### Token Optimization

1. **Bound context windows**: Limit memory to essential messages
2. **Summarize before passing**: Compress iteration history
3. **Use embeddings for retrieval**: Don't pass full documents
4. **Enable prompt caching**: Up to 90% savings on system prompts

#### Batch Processing

```bash
# Process multiple related projects together
# Shared knowledge graph context reduces redundant extraction

# Example: Process all microservices for a platform
project_ids=("auth-service" "user-service" "payment-service")
# Scavenger runs once, shares standards across all
```

### Security Best Practices

Based on [AI Agent Development Lifecycle](https://www.aalpha.net/blog/ai-agent-development-lifecycle/):

1. **Embed security in every stage**:
   - Input validation on all webhook endpoints
   - Sanitize user-uploaded documents
   - Never log sensitive data (API keys, credentials)

2. **Protect against adversarial attacks**:
   - Rate limit API endpoints
   - Validate file types and sizes
   - Monitor for prompt injection attempts

3. **Implement audit trails**:
   - Decision log captures all agent outputs
   - S3 versioning for artifact history
   - n8n execution logs for debugging

### Known Limitations & Workarounds

Based on [n8n AI Agent Limitations](https://latenode.com/blog/low-code-no-code-platforms/n8n-setup-workflows-self-hosting-templates/n8n-ai-agents-2025-complete-capabilities-review-implementation-reality-check):

| Limitation | Impact | Workaround |
|------------|--------|------------|
| **No built-in persistent memory** | Context lost between sessions | Use Graphiti + Qdrant for external memory |
| **No automatic error recovery** | Failed workflows need manual restart | State persistence + Smart Start handler |
| **Limited multi-step reasoning** | Complex tasks may fail | Break into subworkflows with checkpoints |
| **Rate limit sensitivity** | High-volume workflows throttled | Queue mode + retry logic with backoff |

### Research-Driven Development with Perplexity

Use Perplexity MCP to validate architectural decisions before implementation:

```
# Before adding a new technology
"Use Perplexity to research best practices for [technology] in [context],
including common pitfalls, scaling considerations, and alternatives."

# Before designing new features
"Use Perplexity to find case studies of [feature type] implementations
in similar AI orchestration systems."

# Before production deployment
"Use Perplexity to research production deployment checklist for
n8n workflows with AI agents, focusing on monitoring and observability."
```

### Quick Reference: Best Practices Checklist

```markdown
## Pre-Development
✅ Define clear success criteria (quality thresholds)
✅ Research similar implementations with Perplexity
✅ Plan agent responsibilities and handoffs
✅ Design error handling strategy

## Development
✅ Start simple, add complexity iteratively
✅ Use modular subworkflows
✅ Implement comprehensive logging
✅ Add Error Trigger nodes to all critical paths
✅ Configure appropriate memory windows per agent

## Testing
✅ Test each subworkflow independently
✅ Test with various document types and sizes
✅ Verify error handling paths
✅ Check iteration counts and quality scores

## Deployment
✅ Enable queue mode for scalability
✅ Set up health checks
✅ Configure billing alerts
✅ Document runbooks for common issues

## Maintenance
✅ Monitor execution logs weekly
✅ Review quality score trends
✅ Update agent prompts based on feedback
✅ Archive completed projects
✅ Rotate API keys quarterly
```

---

## Context Optimization

This section covers techniques to optimize Claude Code's context window, reducing token usage by up to 47% and improving session persistence.

### Environment Variables

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, or PowerShell profile):

```bash
# Enable on-demand MCP tool loading (saves ~32k tokens / 47% reduction)
export ENABLE_EXPERIMENTAL_MCP_CLI=true

# Optional: Increase MCP output token limit (default: 25,000)
export MAX_MCP_OUTPUT_TOKENS=50000
```

**Windows PowerShell** (`$PROFILE`):
```powershell
$env:ENABLE_EXPERIMENTAL_MCP_CLI = "true"
$env:MAX_MCP_OUTPUT_TOKENS = "50000"
```

### The .context/ Folder

This project includes a `.context/` folder for managing context efficiently:

```
.context/
├── mcp/           # Large MCP tool responses (>50 lines)
├── history/       # Session-specific chat logs and decisions
└── terminal/      # Build/server logs with timestamps
```

See [.context/README.md](.context/README.md) for detailed usage instructions.

### Managing Large Tool Responses

Any MCP tool response greater than 50 lines should be saved to the `.context/mcp/` folder:

```bash
# Example: Save large response to file
echo "$RESPONSE" > .context/mcp/search-results-$(date +%Y%m%d-%H%M%S).md
```

Reference these files as needed rather than keeping full output in active chat context.

### Maintaining Persistent Chat History

Update a local chat history file after each significant milestone to recover information lost during automatic compaction:

```bash
# Save session state before /compact or /clear
# Ask Claude: "Write a summary of our progress to '.context/history/session-YYYY-MM-DD.md'"
```

Resume later with:
```bash
# Ask Claude: "@.context/history/session-2026-01-16.md Let's continue where we left off"
```

### Terminal Session Logging

Log terminal output to files for targeted searching instead of re-running commands:

```bash
# Redirect output to timestamped log file
npm run build 2>&1 | tee .context/terminal/build-$(date +%Y%m%d-%H%M%S).log

# When debugging, search logs instead of re-running:
grep -i "error" .context/terminal/build-*.log

# Or read only the last 20 lines:
tail -20 .context/terminal/build-latest.log
```

### Context Management Commands

| Command | Purpose |
|---------|---------|
| `/context` | View current token usage breakdown |
| `/compact` | Compress conversation history (use proactively at 70% capacity) |
| `/clear` | Reset context completely (use when switching to unrelated tasks) |

### Context Management Best Practices

1. **Monitor context usage**: Run `/context` regularly to see token breakdown
2. **Compact at 70%**: Use `/compact` proactively before hitting auto-compaction at 95%
3. **Clear between tasks**: Use `/clear` when switching to unrelated work
4. **Use scratchpad files**: Offload plans and decisions to markdown files in `.context/history/`
5. **Leverage CLAUDE.md**: Add persistent rules here instead of repeating in each session

**Strategic breakpoints for /compact or /clear:**
- After completing a feature
- Before starting unrelated work
- After making a git commit
- When switching between frontend/backend work
- When context meter reaches 70%

### Token Savings Summary

| Technique | Token Savings | Notes |
|-----------|---------------|-------|
| `ENABLE_EXPERIMENTAL_MCP_CLI=true` | ~32k tokens (47%) | Load MCP tools on-demand |
| Large MCP responses to files | Variable | Prevent flooding context |
| Persistent chat history | Recovery | Maintain decisions across compaction |
| Terminal session logs | Debugging | Search logs instead of re-running |

### Research Sources

- [Claude Code's Hidden MCP Flag](https://paddo.dev/blog/claude-code-hidden-mcp-flag/) - 32k token savings
- [Managing Claude Code Context](https://mcpcat.io/guides/managing-claude-code-context/) - Best practices
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp) - MAX_MCP_OUTPUT_TOKENS
- [Anthropic Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices) - /clear usage

---

## Prerequisites & Dependencies

### n8n Configuration

#### Required Workflows
All four workflows must be imported into your n8n instance:

- ✅ `titan-main-workflow.json` (Main orchestrator)
- ✅ `titan-adversarial-loop-subworkflow.json` (Activated as subworkflow)
- ✅ `titan-graphiti-subworkflow.json` (Activated as subworkflow)
- ✅ `titan-qdrant-subworkflow.json` (Activated as subworkflow)

**Important**: Subworkflows must be marked as "Active" in n8n settings.

#### Required Credentials

1. **OpenAI API** (`OpenAI API`)
   - Type: OpenAI API credential
   - Required for: All AI agents
   - Get key: https://platform.openai.com/api-keys

2. **OpenAI API Header** (`OpenAI API Header`)
   - Type: HTTP Header Auth
   - Header Name: `Authorization`
   - Header Value: `Bearer YOUR_OPENAI_API_KEY`
   - Required for: Qdrant embedding generation

3. **S3/SeaweedFS** (Internal)
   - Configured via environment variables
   - Required for: Document storage and artifact management
   - No external credential needed (uses internal Docker network)

4. **OpenRouter API** (Optional)
   - Type: HTTP Header Auth
   - Required only if using Claude Opus models via OpenRouter
   - Get key: https://openrouter.ai/keys

### Environment Variables

Set these in your n8n instance (Settings → Environment Variables):

```bash
# ============================================
# AI Product Factory - Model Configuration
# ============================================
# These environment variables control which LLM models are used by each agent.
# Override defaults to use newer models (e.g., Claude 4.5, GPT-5) when available.

# Creative/Design Agents (Visionary, Architect)
MODEL_ARCHITECT=anthropic/claude-sonnet-3.5

# Analytical/Validation Agents (Critic, Dr. Doom)
MODEL_CRITIC=openai/gpt-4o

# Improvement Agents (Refiner in Vision & Architecture loops)
MODEL_REFINER=anthropic/claude-sonnet-3.5

# Context Extraction (Scavenger - benefits from large context window)
MODEL_CONTEXT=google/gemini-1.5-pro

# External Research (Perplexity)
MODEL_RESEARCH=perplexity/sonar-pro

# ============================================
# Infrastructure URLs
# ============================================

# Graphiti knowledge graph URL
GRAPHITI_URL=http://graphiti:8000              # Default for Docker
# or
GRAPHITI_URL=http://localhost:8000             # For local development

# Qdrant vector database URL
QDRANT_URL=http://qdrant:6333                  # Default for Docker
# or
QDRANT_URL=http://localhost:6333               # For local development

# Qdrant API key (if authentication is enabled)
QDRANT_API_KEY=your-qdrant-api-key             # Optional

# OpenAI API configuration
OPENAI_API_URL=https://api.openai.com          # Default

# ============================================
# S3/SeaweedFS Configuration
# ============================================
S3_ENDPOINT=http://seaweedfs:8333              # SeaweedFS S3 endpoint
S3_BUCKET=product-factory-artifacts            # Bucket name
S3_ACCESS_KEY=your-access-key                  # S3 access key
S3_SECRET_KEY=your-secret-key                  # S3 secret key
S3_REGION=us-east-1                            # S3 region (default)

# ============================================
# Factory Configuration
# ============================================
FACTORY_MAX_ITERATIONS=5                       # Max adversarial loop iterations
FACTORY_SCORE_THRESHOLD=90                     # Quality threshold (0-100)
FACTORY_BATCH_SIZE=3                           # Document batch size
FACTORY_CONFIRMATION_TIMEOUT=3600              # Human approval timeout (seconds)
```

### External Services

#### 1. Graphiti (Knowledge Graph)

Graphiti stores extracted technical standards and maintains project context.

**Setup Options**:

**Docker with FalkorDB (Recommended)**:
```yaml
# docker-compose.yml snippet
graphiti:
  image: zepai/knowledge-graph-mcp:standalone  # IMPORTANT: Use standalone tag for FalkorDB
  environment:
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - FALKORDB_URI=redis://falkordb:6379       # Connect to FalkorDB container
    - FALKORDB_PASSWORD=
    - FALKORDB_DATABASE=default_db
    - GRAPHITI_GROUP_ID=main
    - PORT=8000                                 # Server listens on port 8000
  depends_on:
    falkordb:
      condition: service_healthy
  healthcheck:
    # Container has curl but NOT wget
    test: ["CMD-SHELL", "curl -sf http://127.0.0.1:8000/health > /dev/null || exit 1"]
    interval: 15s
    timeout: 10s
    retries: 5
    start_period: 90s  # Needs time to initialize

falkordb:
  image: falkordb/falkordb:latest
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 5s
    retries: 10
```

> **IMPORTANT**: The `zepai/knowledge-graph-mcp:latest` tag expects **Neo4j**, not FalkorDB. You MUST use the `standalone` tag to work with FalkorDB via `FALKORDB_URI`.

**Manual Setup**: See https://github.com/getzep/graphiti

#### 2. Qdrant (Vector Database)

Qdrant stores document embeddings for semantic search.

**Setup Options**:

**Docker (Recommended)**:
```yaml
# docker-compose.yml snippet
qdrant:
  image: qdrant/qdrant:v1.16
  environment:
    - QDRANT__SERVICE__API_KEY=${QDRANT_API_KEY:-}
  volumes:
    - qdrant_data:/qdrant/storage
  healthcheck:
    # IMPORTANT: Qdrant container does NOT have curl or wget
    # Use bash TCP check instead
    test: ["CMD-SHELL", "bash -c '(echo > /dev/tcp/localhost/6333) > /dev/null 2>&1'"]
    interval: 10s
    timeout: 5s
    retries: 5
```

> **NOTE**: The Qdrant Docker image is based on Debian but does NOT include `curl` or `wget`. Health checks must use bash's built-in TCP check via `/dev/tcp/`.

**Qdrant Cloud**: https://cloud.qdrant.io (fully managed)

**Manual Setup**: See https://qdrant.tech/documentation/quick-start/

#### 3. SeaweedFS (S3-Compatible Storage)

SeaweedFS provides S3-compatible object storage for all documents and artifacts.

**Setup Options**:

**Docker (Recommended)** - Already included in docker-compose.yml:
```yaml
seaweedfs:
  image: chrislusf/seaweedfs:latest
  command: "server -s3 -dir=/data -s3.port=8333 -filer=false"
  healthcheck:
    # Use master port 9333 for health check (S3 port 8333 requires auth)
    # Use 127.0.0.1 instead of localhost for reliable container binding
    test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:9333/cluster/status > /dev/null 2>&1 || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 30s
```

> **IMPORTANT**:
> - S3 API port (8333) requires authentication - use master port (9333) for health checks
> - Use `127.0.0.1` instead of `localhost` for reliable container binding
> - Add `-filer=false` to command if not using filer features (avoids meta_aggregator errors)

**S3 Storage Structure**:
```
product-factory-artifacts/
└── projects/{projectId}/
    ├── input/           # User-uploaded documents (PDF, MD, DOCX)
    ├── artifacts/       # Generated vision/architecture docs
    ├── state/           # project_state.json
    ├── iterations/      # Version history
    └── standards/       # Approved tech standards export
```

### System Requirements

**n8n Version**: v1.82.0 or higher (for AI Agent node support)

**Node.js**: v18+ (for running n8n)

**Memory**: 2GB+ RAM recommended (AI agents can be memory-intensive)

**Disk Space**: 1GB+ for workflow execution history and embeddings

---

## Troubleshooting

### MCP Connection Issues

#### Problem: "n8n-mcp server not responding"

**Symptoms**: Claude says it can't connect to n8n or workflows aren't visible

**Solutions**:
1. Verify n8n instance is accessible:
   ```powershell
   Invoke-WebRequest -Uri "https://c3po.etrox.de" -Method GET
   ```

2. Check MCP is enabled in n8n:
   - Login to n8n at https://c3po.etrox.de
   - Go to Settings → Instance-level MCP
   - Ensure "Enable MCP access" is toggled ON

3. Verify token hasn't expired:
   - Generate a new MCP Access Token in n8n settings
   - Update the token in your `.mcp.json` (project) or `~/.claude.json` (user) file
   - Restart Claude Code

4. Check firewall/network:
   - Ensure your firewall allows outbound HTTPS to c3po.etrox.de
   - Try from a different network if corporate firewall is blocking

#### Problem: "Workflow not found" or "No workflows available"

**Solutions**:
1. Mark workflows as "Available in MCP":
   - Open each Titan workflow in n8n
   - Enable the "Available in MCP" toggle
   - Save the workflow

2. Ensure workflows have compatible triggers:
   - Titan workflows use Chat Triggers (supported by MCP)
   - Webhook and Schedule triggers are also supported

3. Restart the MCP server:
   - Restart Claude Code completely (close all sessions)
   - Wait 10-15 seconds for MCP initialization

### Workflow Execution Errors

#### Problem: "Credential not found: OpenAI API"

**Solution**: Create credentials with exact names:
- `OpenAI API` for AI Agent nodes
- `OpenAI API Header` for Qdrant embedding generation
- Names must match exactly (case-sensitive)

#### Problem: "Validation Error: Missing input files"

**Solution**: Ensure your project has uploaded input files. Create projects through the Dashboard:
1. Go to `/projects/new`
2. Enter project name
3. Upload at least one document (drag-and-drop)
4. Click "Start Project"

The workflow requires at least one input file in S3 storage.

#### Problem: "Graphiti connection refused"

**Solutions**:
1. Verify Graphiti is running:
   ```bash
   curl http://graphiti:8000/health
   # or
   curl http://localhost:8000/health
   ```

2. Check `GRAPHITI_URL` environment variable in n8n

3. Ensure n8n can reach Graphiti:
   - If using Docker, both containers must be on same network
   - If using external Graphiti, ensure network connectivity

#### Problem: "Qdrant authentication failed"

**Solutions**:
1. If Qdrant has authentication enabled:
   - Set `QDRANT_API_KEY` environment variable in n8n
   - Qdrant workflow uses `api-key` header (not Authorization)

2. If Qdrant doesn't have auth:
   - Remove or leave empty the `QDRANT_API_KEY` variable
   - Workflow will work without authentication

#### Problem: "Embedding generation failed"

**Solution**:
1. Verify `OpenAI API Header` credential is configured:
   - Header Name: `Authorization`
   - Header Value: `Bearer YOUR_OPENAI_API_KEY`

2. Check OpenAI API key has sufficient credits

3. Verify API key has access to `text-embedding-3-small` model

#### Problem: "Subworkflow returns no data"

**Solution**: This was fixed in v2.2.0. Ensure you're using the latest workflows:
- All subworkflows now have proper `Merge Output` nodes
- Re-import workflow files if you have older versions
- Verify all subworkflows are marked "Active"

### Dashboard/Database Errors

#### Problem: "function is_setup_complete() does not exist"

**Symptoms**: After login, error in console:
```
Setup status check failed: error: function is_setup_complete() does not exist
```

**Root Cause**: PostgreSQL init scripts only run on first database creation. When upgrading from a previous version, the new functions/views from `03-app-settings.sql` are never created.

**Solution**: This was fixed in v3.0.1. The settings module now includes fallback implementations:
- `isSetupComplete()` falls back to direct `app_settings` table query
- `isN8nConfigured()` falls back to direct table query
- `getSetupStatus()` falls back to composed table queries

If you see this error:
1. **Update to v3.0.1 or later** - The code now handles missing functions gracefully
2. **Alternative**: Manually run the SQL in `init-scripts/sql-templates/03-app-settings.sql` against your `dashboard` database

The app will now redirect to `/projects` even when functions don't exist, with a debug log message about using the fallback.

### Performance Issues

#### Problem: Workflow takes longer than expected (>45 minutes)

**Possible Causes**:
1. **High OpenAI API latency**: Check OpenAI status page
2. **Many iterations in adversarial loop**: Critic is giving low scores
3. **Large document corpus**: Scavenger processing many files
4. **Network latency**: Slow connection to Graphiti/Qdrant

**Solutions**:
- Monitor iteration counts in workflow execution logs
- Reduce max iterations in adversarial loop (default: 5)
- Use faster models (GPT-4o-mini) for non-critical agents
- Optimize document corpus (remove unnecessary files)

#### Problem: High OpenAI API costs

**Solutions**:
1. **Use GPT-4o-mini for all agents**: ~95% cost reduction
   - Edit each agent node to use `gpt-4o-mini` model
   - Accept slightly lower quality output

2. **Reduce iteration limits**:
   - Lower max iterations from 5 to 3 in adversarial loop
   - Increase quality threshold from 9.0 to 8.5

3. **Batch multiple projects**:
   - Process multiple related projects together
   - Reuse knowledge graph context

4. **Monitor token usage**:
   - Check workflow telemetry for token counts
   - Reduce prompt sizes if needed

### Configuration Validation

Run this validation checklist:

```markdown
✅ n8n instance accessible at https://c3po.etrox.de
✅ MCP enabled in n8n settings
✅ All 4 Titan workflows imported
✅ 3 subworkflows activated
✅ Main workflow has MCP toggle ON
✅ OpenAI API credential exists and named correctly
✅ OpenAI API Header credential exists (for Qdrant)
✅ SeaweedFS S3 service is running and accessible
✅ GRAPHITI_URL environment variable set
✅ QDRANT_URL environment variable set
✅ S3_ENDPOINT environment variable set
✅ Graphiti service is running and accessible
✅ Qdrant service is running and accessible
✅ .mcp.json (project) or ~/.claude.json (user) configured correctly
✅ Claude Code restarted after MCP configuration changes
```

### Dokploy Deployment Issues

This section covers common issues encountered when deploying to Dokploy with Traefik routing.

#### Problem: PostgreSQL version mismatch / health check failing

**Symptoms**: PostgreSQL container fails to start with errors about PGDATA directory not matching expected version.

**Error Example**:
```
FATAL: database files are incompatible with server
DETAIL: The data directory was initialized by PostgreSQL version 16, but this is version 18
```

**Root Cause**: PostgreSQL major versions use different data directory structures. PostgreSQL 18+ uses `/var/lib/postgresql/18/docker` instead of `/var/lib/postgresql/data`.

**Solution**:
1. Update docker-compose.dokploy.yml for PostgreSQL 18:
   ```yaml
   postgres:
     image: postgres:18-alpine
     volumes:
       # PostgreSQL 18+ uses /var/lib/postgresql (not /var/lib/postgresql/data)
       - postgres18_data:/var/lib/postgresql
       - ./init-scripts:/docker-entrypoint-initdb.d:ro
   ```

2. Rename the volume to force a fresh initialization:
   ```yaml
   volumes:
     postgres18_data:  # New volume name triggers fresh init
   ```

> **Important**: PostgreSQL 18 (November 2025) introduced a PGDATA path change. Always check the PostgreSQL release notes when upgrading major versions.

#### Problem: Port already allocated error

**Symptoms**: Deployment fails with "port X already allocated" error.

**Error Example**:
```
Error response from daemon: driver failed programming external connectivity:
Bind for 0.0.0.0:3000 failed: port is already allocated
```

**Solution**: Remove explicit port mappings when using Traefik. Traefik handles routing via reverse proxy, not port bindings:

```yaml
# ❌ Don't do this with Traefik
dashboard:
  ports:
    - "3000:3000"

# ✅ Do this instead - Traefik handles routing
dashboard:
  # ports removed - Traefik handles routing
  networks:
    - n8n_network
```

#### Problem: Module not found in Docker container

**Symptoms**: Dashboard container crashes with module not found errors.

**Error Example**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@tanstack/history'
```

**Root Cause**: Multi-stage Dockerfile doesn't include production dependencies in the runner stage.

**Solution**: Install production dependencies in the runner stage:
```dockerfile
# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

# Copy built application
COPY --from=builder --chown=dashboard:nodejs /app/dist ./dist
COPY --from=builder --chown=dashboard:nodejs /app/package.json ./package.json
COPY --from=builder --chown=dashboard:nodejs /app/package-lock.json ./package-lock.json

# Install production dependencies only
RUN npm ci --omit=dev

USER dashboard
CMD ["node", "dist/server/server.js"]
```

#### Problem: npm ci fails with package lock mismatch

**Symptoms**: Build fails during `npm ci` step.

**Error Example**:
```
npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync.
```

**Root Cause**: package.json was updated but package-lock.json was never regenerated and committed.

**Solution**:
1. Regenerate the lock file locally:
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   ```
2. Commit both files together:
   ```bash
   git add package.json package-lock.json
   git commit -m "fix: Sync package-lock.json with package.json"
   git push
   ```

#### Problem: SeaweedFS meta_aggregator connection errors

**Symptoms**: SeaweedFS logs show repeated connection refused errors.

**Error Example**:
```
meta_aggregator.go:98] failed to subscribe remote meta change: rpc error:
code = Unavailable desc = connection error:
desc = "transport: Error while dialing: dial tcp 10.0.0.4:18888: connect: connection refused"
```

**Root Cause**: SeaweedFS filer component is enabled but not needed for S3-only usage.

**Solution**: Disable the filer component:
```yaml
seaweedfs:
  image: chrislusf/seaweedfs:latest
  command: "server -s3 -dir=/data -ip=seaweedfs -s3.port=8888 -filer=false"
```

#### Problem: Redis/FalkorDB memory overcommit warnings

**Symptoms**: Redis and FalkorDB logs show memory warnings.

**Warning Example**:
```
WARNING Memory overcommit must be enabled! Without it, a background save or replication may fail.
To fix this issue add 'vm.overcommit_memory = 1' to /etc/sysctl.conf and reboot
```

**Root Cause**: Host system kernel parameter needs adjustment.

**Solution**: This requires host-level access (cannot be fixed in Docker Compose):
```bash
# Temporary fix (lost on reboot)
sudo sysctl vm.overcommit_memory=1

# Permanent fix
echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

> **Note**: On Dokploy managed servers, you may need SSH access to run these commands.

#### Problem: Google OAuth redirect mismatch

**Symptoms**: Google OAuth login fails with redirect URI mismatch error.

**Solution**: Configure the correct redirect URI in Google Cloud Console:

**Authorized redirect URIs**:
```
https://dashboard.yourdomain.com/api/auth/callback/google
```

**Better-Auth Pattern**: The redirect URI follows the pattern:
```
https://<AUTH_URL>/api/auth/callback/<provider>
```

Ensure your `AUTH_URL` environment variable matches your dashboard domain exactly:
```bash
AUTH_URL=https://dashboard.yourdomain.com
```

#### Problem: Volume cleanup for fresh deployments

**Symptoms**: Need to start fresh but can't delete volumes in Dokploy UI.

**Solution**: Rename all volumes to force fresh initialization:

```yaml
volumes:
  n8n_data_v2:           # Renamed from n8n_data
  postgres18_data:       # New name for PostgreSQL 18
  redis_data_v2:         # Renamed from redis_data
  qdrant_data_v2:        # Renamed from qdrant_data
  falkordb_data_v2:      # Renamed from falkordb_data
  seaweedfs_data_v2:     # Renamed from seaweedfs_data
```

Update all service volume mounts to use the new names. Old volumes will be cleaned up automatically when orphaned.

#### Problem: n8n Python task runner warning

**Symptoms**: n8n logs show Python task runner error.

**Warning Example**:
```
Failed to start Python task runner in internal mode.
Do you have a valid Python installation available on your path?
```

**Impact**: Non-critical. This only affects Python-based n8n nodes (not used by AI Product Factory).

**Solution**: Safe to ignore. If you need Python nodes, install Python in your n8n container or use external task runner mode.

### Dokploy Deployment Checklist

```markdown
## Pre-Deployment
✅ package.json and package-lock.json are in sync
✅ Dockerfile installs production dependencies in runner stage
✅ docker-compose.dokploy.yml has no explicit port mappings
✅ PostgreSQL volume mount uses correct path for version
✅ Environment variables configured in Dokploy

## Domain Configuration
✅ DNS records point to Dokploy server
✅ Traefik domains configured for each service
✅ HTTPS enabled with Let's Encrypt
✅ Google OAuth redirect URI matches AUTH_URL

## Post-Deployment Verification
✅ All containers show healthy status
✅ n8n accessible at https://n8n.yourdomain.com/healthz
✅ Dashboard accessible at https://dashboard.yourdomain.com/api/health
✅ S3 bucket created and accessible
✅ Google OAuth login works
✅ Workflows auto-imported by n8n-entrypoint.sh (check logs: docker compose logs n8n)

## First-Time Credential Setup (10-15 min)
✅ Create OpenRouter API credential in n8n UI
✅ Create OpenAI API Header credential (for embeddings)
✅ Create Zep Api account credential (for memory)
✅ Re-link credentials in each workflow
✅ Activate critical workflows (API, Main Orchestrator)
```

---

## Docker Health Check Best Practices

This section documents critical learnings about Docker health checks for all services in the AI Product Factory stack. These patterns were validated through extensive local testing.

### General Principles

1. **Use GET requests instead of HEAD**: Many servers (including Nitro/TanStack Start) don't respond to HEAD requests on API endpoints
   ```yaml
   # ❌ DON'T use --spider (sends HEAD request)
   test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]

   # ✅ DO use -qO- (sends GET request)
   test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health > /dev/null 2>&1 || exit 1"]
   ```

2. **Use 127.0.0.1 instead of localhost**: Some containers bind to IP addresses that don't resolve from `localhost`
   ```yaml
   # ❌ May fail if localhost doesn't resolve correctly
   test: ["CMD-SHELL", "wget -qO- http://localhost:9333/..."]

   # ✅ Reliable container binding
   test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:9333/..."]
   ```

3. **Check available tools in container**: Not all containers have `curl` or `wget`
   ```bash
   # Check what's available
   docker exec <container> which curl wget nc
   ```

### Service-Specific Health Checks

| Service | Tool Available | Health Check Command |
|---------|----------------|---------------------|
| **n8n** | wget | `wget -qO- http://127.0.0.1:5678/healthz > /dev/null 2>&1 \|\| exit 1` |
| **PostgreSQL** | pg_isready | `pg_isready -U ${USER} -d ${DB}` |
| **Redis** | redis-cli | `redis-cli ping` (or with `-a ${PASSWORD}`) |
| **Qdrant** | bash only | `bash -c '(echo > /dev/tcp/localhost/6333) > /dev/null 2>&1'` |
| **Graphiti** | curl | `curl -sf http://127.0.0.1:8000/health > /dev/null \|\| exit 1` |
| **FalkorDB** | redis-cli | `redis-cli ping` |
| **SeaweedFS** | wget | `wget -qO- http://127.0.0.1:9333/cluster/status > /dev/null 2>&1 \|\| exit 1` |
| **Frontend** | wget | `wget -qO- http://127.0.0.1:3000/api/health > /dev/null 2>&1 \|\| exit 1` |

### Qdrant: No HTTP Tools Available

The Qdrant Docker image (`qdrant/qdrant:v1.16`) is based on Debian but does **NOT** include `curl`, `wget`, or `nc`. Use bash's built-in TCP check:

```yaml
qdrant:
  image: qdrant/qdrant:v1.16
  healthcheck:
    # Bash TCP check - works without curl/wget
    test: ["CMD-SHELL", "bash -c '(echo > /dev/tcp/localhost/6333) > /dev/null 2>&1'"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 10s
```

### Graphiti: Use Standalone Tag for FalkorDB

The `zepai/knowledge-graph-mcp:latest` tag expects **Neo4j** and will fail to connect to FalkorDB. Use the `standalone` tag:

```yaml
graphiti:
  image: zepai/knowledge-graph-mcp:standalone  # NOT :latest
  environment:
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - FALKORDB_URI=redis://falkordb:6379
    - FALKORDB_PASSWORD=
    - FALKORDB_DATABASE=default_db
    - GRAPHITI_GROUP_ID=main
    - PORT=8000  # Server uses port 8000, not 8080
  healthcheck:
    # Container has curl but not wget
    test: ["CMD-SHELL", "curl -sf http://127.0.0.1:8000/health > /dev/null || exit 1"]
    interval: 15s
    timeout: 10s
    retries: 5
    start_period: 90s  # Needs initialization time
```

### SeaweedFS: Use Master Port for Health Check

The S3 API port (8333) requires authentication, which makes health checks fail. Use the master port (9333) instead:

```yaml
seaweedfs:
  image: chrislusf/seaweedfs:latest
  command: "server -s3 -dir=/data -s3.port=8333 -filer=false"
  healthcheck:
    # ❌ S3 port requires auth
    # test: ["CMD-SHELL", "wget -qO- http://localhost:8333/..."]

    # ✅ Master port is unauthenticated
    test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:9333/cluster/status > /dev/null 2>&1 || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 30s
```

### Start Period Recommendations

Different services require different initialization times:

| Service | Recommended start_period | Reason |
|---------|-------------------------|--------|
| **PostgreSQL** | 30s | Database initialization |
| **Redis** | 5s | Fast startup |
| **Qdrant** | 10s | Index loading |
| **FalkorDB** | 5s | Fast startup |
| **Graphiti** | 90s | LLM client initialization, graph setup |
| **SeaweedFS** | 30s | Volume initialization |
| **n8n** | 30s | Database migrations |
| **Frontend** | 30s | SSR build warm-up |

### Complete Health Check Test Template

Use this compose file to validate all health checks locally:

```yaml
# /tmp/test-healthchecks.yml
services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test -d test"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7.4-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  qdrant:
    image: qdrant/qdrant:v1.16
    healthcheck:
      test: ["CMD-SHELL", "bash -c '(echo > /dev/tcp/localhost/6333) > /dev/null 2>&1'"]
      interval: 5s
      timeout: 5s
      retries: 10

  falkordb:
    image: falkordb/falkordb:latest
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  graphiti:
    image: zepai/knowledge-graph-mcp:standalone
    environment:
      - OPENAI_API_KEY=test-key
      - FALKORDB_URI=redis://falkordb:6379
      - PORT=8000
    depends_on:
      falkordb:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://127.0.0.1:8000/health > /dev/null || exit 1"]
      interval: 5s
      timeout: 10s
      retries: 15
      start_period: 90s

  seaweedfs:
    image: chrislusf/seaweedfs:latest
    command: "server -s3 -dir=/data -s3.port=8333 -filer=false"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:9333/cluster/status > /dev/null 2>&1 || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 15s
```

Run with: `docker compose -f /tmp/test-healthchecks.yml up -d`
Check status: `docker compose -f /tmp/test-healthchecks.yml ps`

---

## Dashboard Application

The frontend dashboard provides a web-based interface for managing AI Product Factory projects.

### Technology Stack

| Technology | Purpose |
|------------|---------|
| **TanStack Start** | Full-stack React framework with SSR |
| **Better-Auth** | Google OAuth authentication |
| **Shadcn UI** | Component library (16+ components) |
| **TanStack Query** | Data fetching and caching |
| **Sonner** | Toast notifications with theme integration |
| **React Hook Form** | Form state management with validation |
| **Radix UI** | Accessible primitives (AlertDialog, etc.) |
| **PostgreSQL** | Project state storage |
| **SeaweedFS** | S3-compatible artifact storage |

### Dashboard Features

#### Authentication
- Google OAuth 2.0 with domain restriction
- Session management with secure cookies
- Protected routes for all project pages

#### Project Overview
- Grid of project cards showing name, phase, status
- Quick navigation to project details
- Real-time status updates

#### Project Detail View
- **Artifacts Tab**: View and download generated documents with Markdown rendering
- **ADRs Tab**: Browse Architecture Decision Records parsed from decision_log.md
- **Chat Tab**: Interactive chat interface for workflow interaction
- **History Tab**: Timeline of workflow iterations and decisions
- **Export Button**: Download all project artifacts as ZIP

#### ADR Viewer
- Parses ADRs from decision log files
- Split-pane view with list and detail panels
- Filtering by title, ID, or status
- Status badges (proposed, accepted, deprecated, superseded)

#### Setup Wizard (n8n Integration)

A 6-step guided wizard for configuring n8n integration after fresh deployment.

**Problem Solved**: After a fresh Dokploy deployment, users need to configure n8n integration manually. The previous auto-bootstrap approach had issues with workflow ID length limits and credential references not existing in fresh n8n instances.

**Architecture Overview**:
```
┌─────────────────────────────────────────────────────────────────┐
│  User-Driven Setup Flow                                          │
├─────────────────────────────────────────────────────────────────┤
│  1. User deploys with Dokploy → All services start               │
│  2. User logs in → App checks: is n8n configured?                │
│  3. If NO → Redirect to /setup/welcome                           │
│  4. Setup Wizard guides through 6 steps                          │
│  5. Settings Page available post-setup for management            │
└─────────────────────────────────────────────────────────────────┘
```

**Wizard Steps**:

| Step | Route | Purpose |
|------|-------|---------|
| 1. Welcome | `/setup/welcome` | Overview and prerequisites check |
| 2. Connect | `/setup/connect` | Enter n8n URL + API key with connection test |
| 3. Import | `/setup/import` | Import workflows via n8n REST API with progress |
| 4. Webhooks | `/setup/webhooks` | Auto-detect and display webhook URLs |
| 5. Verify | `/setup/verify` | Test all connections and verify health |
| 6. Complete | `/setup/complete` | Success summary and next steps |

**Workflow Import Order** (dependencies first):
1. `ai-product-factory-s3-subworkflow.json`
2. `ai-product-factory-decision-logger-subworkflow.json`
3. `pf-perplexity-research.json`
4. `ai-product-factory-scavenging-subworkflow.json`
5. `ai-product-factory-vision-loop-subworkflow.json`
6. `ai-product-factory-architecture-loop-subworkflow.json`
7. `ai-product-factory-api-workflow.json`
8. `ai-product-factory-main-workflow.json`

**Settings Management** (post-setup):
- View/edit n8n configuration at `/settings/n8n`
- Update workflows when new versions available
- Health status indicators for all services
- Re-run wizard option for reconfiguration

### UI/UX Components

The dashboard implements production-grade UI/UX patterns following 2025-2026 best practices for TanStack Start applications.

#### Route Error Boundaries

All routes use centralized error handling via `RouteErrorBoundary`:

```tsx
// Usage in route definition
export const Route = createFileRoute("/projects/$projectId/")({
  component: ProjectDetailPage,
  errorComponent: RouteErrorBoundary,
  pendingComponent: ProjectDetailSkeleton,
  pendingMs: 200,      // Delay before showing loading state
  pendingMinMs: 300,   // Minimum time to show loading state
});
```

**File**: `frontend/components/error/RouteErrorBoundary.tsx`

Features:
- **Retry button**: Attempts to reload the current route
- **Go back**: Returns to previous page in history
- **Go home**: Returns to dashboard root
- **Dev mode stack trace**: Shows full error details in development
- **NotFound component**: Exported for 404 handling at root level

#### Loading Skeletons

Contextual skeleton loaders for smooth route transitions:

**File**: `frontend/components/loading/RouteLoadingSpinner.tsx`

| Component | Usage |
|-----------|-------|
| `RouteLoadingSpinner` | Generic centered spinner |
| `ProjectListSkeleton` | Projects grid with card placeholders |
| `ProjectDetailSkeleton` | Full project detail page structure |
| `FormSkeleton` | New project form layout |

#### Toast Notifications

Sonner-based toast system with theme integration:

**File**: `frontend/components/ui/sonner.tsx`

```tsx
import { toast } from "sonner";

// Success notification
toast.success("Project created", {
  description: "Your project is now being processed",
});

// Error notification
toast.error("Failed to export", {
  description: error.message,
});
```

The `<Toaster />` component is mounted in `__root.tsx` and automatically inherits theme colors.

#### Alert Components

Styled inline alerts for form validation and error display:

**File**: `frontend/components/ui/alert.tsx`

| Variant | Usage |
|---------|-------|
| `default` | Neutral information |
| `destructive` | Errors and critical issues |
| `success` | Successful operations |
| `warning` | Cautionary messages |
| `info` | Informational notices |

```tsx
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>{errorMessage}</AlertDescription>
</Alert>
```

#### AlertDialog Component

Confirmation dialogs for destructive actions:

**File**: `frontend/components/ui/alert-dialog.tsx`

Built on Radix UI AlertDialog primitive with shadcn/ui styling.

#### shadcn/ui Configuration

**File**: `frontend/components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "styles/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

This enables the shadcn CLI: `npx shadcn add <component>`

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check with database connectivity status |
| `/api/auth/*` | GET/POST | Better-Auth authentication routes |
| `/api/start-project` | POST | Create new project and trigger workflow |
| `/api/presigned-url` | POST | Generate S3 presigned URL for file upload |
| `/api/governance` | POST | Submit batch governance decisions (with retry) |
| `/api/setup/status` | GET | Check if setup wizard completed (public) |
| `/api/setup/n8n/test-connection` | POST | Test n8n URL + API key connectivity |
| `/api/setup/n8n/save-config` | POST | Save n8n API URL and encrypted API key |
| `/api/setup/workflows/list` | GET | List bundled workflows with import status |
| `/api/setup/workflows/import` | POST | Import one or all workflows to n8n |
| `/api/setup/workflows/verify` | POST | Test webhook accessibility |
| `/api/setup/complete` | POST | Mark setup wizard as complete |
| `/api/settings/n8n` | GET/PUT/DELETE | Manage n8n settings (post-setup) |

**API Features:**
- **Correlation IDs**: All responses include `x-correlation-id` header for distributed tracing
- **Structured Logging**: JSON logs in production, human-readable in development
- **Retry Logic**: Automatic retry with exponential backoff for n8n webhook calls
- **Request Context**: Method, path, user-agent, client IP captured for debugging

### Running the Dashboard

```bash
cd frontend
npm install
npm run dev     # Development server on port 3000
npm run build   # Production build
npm run start   # Start production server
```

---

## Setup Wizard Implementation

The Setup Wizard is a frontend-based solution for configuring n8n integration after fresh deployment. This section documents the technical implementation details.

### Database Schema

**File**: `init-scripts/sql-templates/03-app-settings.sql`

```sql
-- Application settings table (key-value with encryption support)
CREATE TABLE IF NOT EXISTS app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    setting_type VARCHAR(50) DEFAULT 'string',
    is_sensitive BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(255)
);

-- Workflow registry (tracks imported workflows)
CREATE TABLE IF NOT EXISTS workflow_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_name VARCHAR(255) NOT NULL,
    workflow_file VARCHAR(255) NOT NULL UNIQUE,
    n8n_workflow_id VARCHAR(100),
    local_version VARCHAR(50) NOT NULL,
    webhook_paths JSONB DEFAULT '[]'::JSONB,
    is_active BOOLEAN DEFAULT FALSE,
    import_status VARCHAR(50) DEFAULT 'pending',
    last_import_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_app_settings_key ON app_settings(setting_key);
CREATE INDEX idx_workflow_registry_status ON workflow_registry(import_status);
```

**Settings Keys**:

| Key | Type | Encrypted | Description |
|-----|------|-----------|-------------|
| `n8n.api_url` | string | No | n8n instance base URL |
| `n8n.api_key` | string | **Yes** | n8n API key (AES-256-GCM) |
| `n8n.webhook_base_url` | string | No | Base URL for webhooks |
| `setup.wizard_completed` | boolean | No | Setup completion flag |
| `setup.completed_at` | string | No | Timestamp of completion |

### Core Library Files

#### Encryption Library (`frontend/lib/encryption.ts`)

AES-256-GCM encryption for sensitive data using AUTH_SECRET as key derivation source.

```typescript
import { encrypt, decrypt, mask, hash, generateSecret, isEncryptionConfigured } from '@/lib/encryption';

// Encrypt API key before storing
const encryptedKey = encrypt(apiKey);

// Decrypt when making API calls
const decryptedKey = decrypt(encryptedKey);

// Mask for display: "sk-****1234"
const maskedKey = mask(apiKey);

// Hash for comparison (HMAC-SHA256)
const hashedValue = hash(value);

// Generate random secret
const secret = generateSecret(32);

// Check if encryption is properly configured
if (!isEncryptionConfigured()) {
  throw new Error('AUTH_SECRET not configured');
}
```

**Security Features**:
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Random IV**: 12-byte IV generated per encryption
- **Auth Tag**: 16-byte authentication tag for integrity
- **Ciphertext Format**: `base64(IV + authTag + ciphertext)`

#### Settings Library (`frontend/lib/settings.ts`)

CRUD operations for app_settings table with automatic encryption handling.

```typescript
import { getSetting, setSetting, deleteSetting, isN8nConfigured } from '@/lib/settings';

// Get a setting (auto-decrypts if is_sensitive=true)
const apiUrl = await getSetting('n8n.api_url');

// Set a setting (auto-encrypts if is_sensitive=true)
await setSetting('n8n.api_key', apiKey, {
  type: 'string',
  sensitive: true,
  updatedBy: user.email
});

// Quick check for n8n configuration
const configured = await isN8nConfigured();
```

#### n8n API Client (`frontend/lib/n8n-api.ts`)

REST API client for n8n Public API v1.

```typescript
import { N8nApiClient, testN8nConnection, listWorkflows, createWorkflow, activateWorkflow } from '@/lib/n8n-api';

// Test connection
const result = await testN8nConnection(url, apiKey);
// Returns: { success: boolean, version?: string, error?: string }

// Create client instance
const client = new N8nApiClient(url, apiKey);

// List all workflows
const workflows = await client.listWorkflows();

// Create workflow from JSON
const workflow = await client.createWorkflow(workflowJson);

// Activate workflow
await client.activateWorkflow(workflowId);
```

#### Workflow Importer (`frontend/lib/workflow-importer.ts`)

Logic for importing bundled workflows with dependency ordering.

```typescript
import {
  getBundledWorkflows,
  importWorkflow,
  importAllWorkflows,
  extractWebhookPaths,
  checkForUpdates
} from '@/lib/workflow-importer';

// Get list of bundled workflows
const workflows = await getBundledWorkflows();

// Import single workflow
const result = await importWorkflow('ai-product-factory-s3-subworkflow.json', client);

// Import all with progress callback
await importAllWorkflows(client, (progress) => {
  console.log(`${progress.completed}/${progress.total}: ${progress.current}`);
});

// Extract webhook paths from workflow JSON
const webhooks = extractWebhookPaths(workflowJson);
// Returns: ['/webhook/start-project', '/webhook/governance-batch']

// Check for available updates
const updates = await checkForUpdates();
```

### Setup Wizard Components

| Component | Props | Purpose |
|-----------|-------|---------|
| `SetupWizardLayout` | `step`, `totalSteps`, `children` | Shared layout with stepper |
| `SetupStepWelcome` | - | Prerequisites and overview |
| `SetupStepConnect` | `apiUrl`, `apiKey`, `onTest`, `onSave` | n8n connection form |
| `SetupStepImport` | `workflows`, `onImport`, `progress` | Workflow import with progress |
| `SetupStepWebhooks` | `webhooks` | Detected webhook display |
| `SetupStepVerify` | `checks`, `onRetest` | Verification checklist |
| `SetupStepComplete` | `summary` | Success and next steps |

### Security Considerations

1. **API Key Encryption**: Stored encrypted using AES-256-GCM with AUTH_SECRET
2. **Server-Side Only**: API key never sent to browser; n8n calls made server-side
3. **Auth Required**: All `/api/setup/*` routes require authentication except `/status`
4. **Masked Display**: API key shown as `sk-****1234` in settings UI
5. **HTTPS Validation**: n8n URL validated for HTTPS in production
6. **CORS**: API routes validate origin for security

### Environment Variables

```bash
# Required for encryption
AUTH_SECRET=your-32-character-secret-key!!

# Database connection
DATABASE_URL=postgresql://user:pass@host:5432/db

# Optional: Skip SSL validation for local testing
NODE_TLS_REJECT_UNAUTHORIZED=0  # Development only!
```

### Testing the Setup Wizard

**Unit Tests** (390 tests total):

```bash
# Run all frontend tests
cd frontend && npm run test

# Run setup wizard tests only
cd frontend && npm run test -- --grep "Setup"

# Run encryption tests only
cd frontend && npm run test -- --grep "Encryption"
```

**Manual Testing Checklist**:

1. ✅ Fresh deployment shows setup wizard on first login
2. ✅ Connection test validates n8n URL and API key
3. ✅ Workflow import shows progress for all 8 workflows
4. ✅ Webhook URLs are auto-detected and displayed
5. ✅ Verification checks all services
6. ✅ Settings page allows reconfiguration post-setup
7. ✅ Re-running wizard is possible from settings

**E2E Testing** (requires Docker environment):

```bash
# Start test environment
npm run test:env:up

# Run E2E tests (when available)
npx playwright test tests/e2e/setup-wizard.spec.ts

# Cleanup
npm run test:env:down
```

### Troubleshooting Setup Wizard

#### Problem: "AUTH_SECRET not configured"

**Solution**: Ensure AUTH_SECRET environment variable is set (minimum 16 characters):
```bash
AUTH_SECRET=your-secret-key-at-least-16-chars
```

#### Problem: "Connection test failed"

**Solutions**:
1. Verify n8n URL is accessible from the server
2. Check API key has correct permissions
3. Ensure n8n API is enabled in n8n settings

#### Problem: "Workflow import failed"

**Solutions**:
1. Check n8n has sufficient storage/memory
2. Verify workflow JSON files exist in `/workflows` directory
3. Check n8n logs for specific error messages

#### Problem: "Encryption/Decryption failed"

**Solutions**:
1. Ensure AUTH_SECRET hasn't changed since encryption
2. Check for corrupted ciphertext in database
3. Verify pgcrypto extension is enabled

---

## CI/CD Pipeline

The project includes GitHub Actions for automated deployment and workflow synchronization.

### Workflow: `.github/workflows/deploy.yml`

```yaml
Jobs:
1. validate      # Lint and type check
2. sync-workflows # Sync n8n workflows via API
3. notify-deploy  # Trigger Dokploy deployment
4. health-check   # Verify services are healthy
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `N8N_API_URL` | n8n instance URL (e.g., `https://c3po.etrox.de`) |
| `N8N_API_KEY` | n8n API key (generate in Settings → API) |
| `DOKPLOY_WEBHOOK_URL` | Dokploy deployment webhook (optional) |
| `DASHBOARD_URL` | Dashboard URL for health checks (optional) |

### Workflow Sync Script

The `scripts/sync-workflows.js` script syncs local workflow JSON files to n8n:

```bash
# Preview changes (dry run)
npm run sync-workflows:dry-run

# Apply changes
npm run sync-workflows

# Verbose output
npm run sync-workflows:verbose
```

**Features:**
- Upserts workflows by name (creates new or updates existing)
- Supports `--dry-run`, `--verbose`, `--activate` flags
- Colored terminal output with statistics
- Retry logic for transient failures

---

## Development & Contribution

### Codebase Structure

```
ai-product-factory/
├── .github/
│   └── workflows/
│       └── deploy.yml                     # CI/CD pipeline
├── frontend/                              # Dashboard application
│   ├── app/routes/                        # TanStack file-based routing
│   │   ├── api/                          # API routes
│   │   │   ├── start-project.ts          # Create project endpoint
│   │   │   ├── presigned-url.ts          # S3 upload URL endpoint
│   │   │   ├── governance.ts             # Batch governance endpoint
│   │   │   └── setup/                    # Setup wizard API routes
│   │   │       ├── status.ts             # Check setup completion (public)
│   │   │       ├── n8n/
│   │   │       │   ├── test-connection.ts # Test n8n connectivity
│   │   │       │   └── save-config.ts    # Save n8n config (encrypted)
│   │   │       ├── workflows/
│   │   │       │   ├── list.ts           # List bundled workflows
│   │   │       │   ├── import.ts         # Import workflows to n8n
│   │   │       │   └── verify.ts         # Verify webhook accessibility
│   │   │       └── complete.ts           # Mark setup complete
│   │   ├── setup/                        # Setup wizard pages
│   │   │   ├── index.tsx                 # Setup entry point (redirect logic)
│   │   │   ├── welcome.tsx               # Step 1: Welcome & prerequisites
│   │   │   ├── connect.tsx               # Step 2: n8n URL + API key
│   │   │   ├── import.tsx                # Step 3: Workflow import
│   │   │   ├── webhooks.tsx              # Step 4: Webhook detection
│   │   │   ├── verify.tsx                # Step 5: Verification
│   │   │   └── complete.tsx              # Step 6: Success summary
│   │   ├── settings/                     # Settings pages (post-setup)
│   │   │   ├── index.tsx                 # Settings entry point
│   │   │   └── n8n.tsx                   # n8n configuration management
│   │   └── projects/
│   │       ├── index.tsx                 # Projects list
│   │       ├── new.tsx                   # New project page (drag-drop upload)
│   │       └── $projectId.tsx            # Project detail view
│   ├── components/                        # React components
│   │   ├── adr/                          # ADR Viewer components
│   │   ├── artifacts/                    # Document viewer
│   │   ├── auth/                         # Authentication (UserMenu)
│   │   ├── chat/                         # Chat interface
│   │   ├── error/                        # Error handling components
│   │   │   └── RouteErrorBoundary.tsx    # Route error boundary + NotFound
│   │   ├── governance/                   # Governance UI components
│   │   │   └── GovernanceWidget.tsx      # Tech Stack Configurator
│   │   ├── history/                      # History timeline
│   │   ├── loading/                      # Loading state components
│   │   │   └── RouteLoadingSpinner.tsx   # Skeletons for routes
│   │   ├── setup/                        # Setup wizard components
│   │   │   ├── SetupWizardLayout.tsx     # Shared wizard layout with stepper
│   │   │   ├── SetupStepWelcome.tsx      # Welcome step component
│   │   │   ├── SetupStepConnect.tsx      # Connect step with form
│   │   │   ├── SetupStepImport.tsx       # Import step with progress
│   │   │   ├── SetupStepWebhooks.tsx     # Webhooks display
│   │   │   ├── SetupStepVerify.tsx       # Verification checklist
│   │   │   └── SetupStepComplete.tsx     # Completion summary
│   │   ├── upload/                       # File upload components
│   │   │   └── FileUpload.tsx            # Drag-drop file uploader
│   │   └── ui/                           # Shadcn components
│   │       ├── alert.tsx                 # Alert with variants
│   │       ├── alert-dialog.tsx          # Confirmation dialogs
│   │       ├── sonner.tsx                # Toast notifications
│   │       └── ...                       # Other shadcn components
│   ├── components.json                    # shadcn CLI configuration
│   ├── lib/                              # Utilities
│   │   ├── auth.ts                       # Better-Auth configuration
│   │   ├── auth-client.ts                # Client-side auth hooks
│   │   ├── db.ts                         # PostgreSQL client
│   │   ├── s3.ts                         # SeaweedFS client (with presigned URLs)
│   │   ├── schemas.ts                    # Zod validation schemas
│   │   ├── n8n.ts                        # n8n webhook client (with retry logic)
│   │   ├── n8n-api.ts                    # n8n REST API client (workflow import)
│   │   ├── settings.ts                   # App settings CRUD (getSetting/setSetting)
│   │   ├── workflow-importer.ts          # Workflow import logic with ordering
│   │   ├── encryption.ts                 # AES-256-GCM encryption for API keys
│   │   ├── logger.ts                     # Structured logging utility
│   │   ├── request-context.ts            # Request context & correlation ID handling
│   │   └── export.ts                     # ZIP export utility
│   ├── tests/                            # Frontend component tests
│   │   ├── setup.ts                      # Vitest setup with Radix UI mocks
│   │   ├── GovernanceWidget.test.tsx     # GovernanceWidget tests (24 tests)
│   │   ├── request-context.test.ts       # Request context tests (26 tests)
│   │   ├── encryption.test.ts            # Encryption library tests (22 tests)
│   │   └── setup-wizard.test.tsx         # Setup wizard component tests (100+ tests)
│   ├── vitest.config.ts                  # Frontend Vitest configuration
│   └── types/                            # TypeScript types
├── tests/                                 # Backend integration tests
│   ├── backend.test.ts                   # n8n, PostgreSQL, S3 tests
│   └── setup.ts                          # Test setup (future)
├── scripts/
│   ├── sync-workflows.js                 # n8n workflow sync script
│   ├── run-tests.sh                      # Full test suite runner (Docker + tests)
│   ├── test-sync-dry-run.sh              # Workflow sync dry-run test
│   ├── test-migration-idempotency.sh     # Database migration test
│   └── validate-production-parity.sh     # Production parity validation script
├── init-scripts/
│   ├── 01-project-state.sql              # Database schema (requires pgcrypto)
│   └── sql-templates/
│       └── 03-app-settings.sql           # Setup wizard settings & workflow registry
├── docker-compose.test.yml               # Test environment (PostgreSQL, SeaweedFS, n8n)
├── docker-compose.local-prod.yml         # Production-parity testing (mirrors Dokploy)
├── .env.local-prod.example               # Environment template for local-prod testing
├── workflows/                             # n8n workflow definitions
│   │
│   │   # Titan Workflow Suite
│   ├── titan-main-workflow.json           # Main orchestrator (61KB)
│   ├── titan-adversarial-loop-subworkflow.json        # Adversarial loop (21KB)
│   ├── titan-graphiti-subworkflow.json    # Knowledge graph ops (14KB)
│   ├── titan-qdrant-subworkflow.json      # Vector DB ops (22KB)
│   ├── titan-paper-trail-packager-subworkflow.json    # Iteration history packaging
│   │
│   │   # AI Product Factory (Human-in-the-Loop)
│   ├── ai-product-factory-main-workflow.json              # Main orchestrator with Smart Start
│   ├── ai-product-factory-api-workflow.json               # API webhooks (start-project, governance-batch)
│   ├── ai-product-factory-scavenging-subworkflow.json     # Phase 0: Context extraction (S3-based)
│   ├── ai-product-factory-vision-loop-subworkflow.json    # Phase 1: Product Vision
│   ├── ai-product-factory-architecture-loop-subworkflow.json  # Phase 2: ARC42 Architecture
│   ├── ai-product-factory-perplexity-research-subworkflow.json # Research tool
│   ├── ai-product-factory-decision-logger-subworkflow.json    # Paper trail logging (S3-based)
│   ├── ai-product-factory-s3-subworkflow.json             # S3 operations (upload, download, list, presigned URLs)
│   │
│   └── Documentation/
│       ├── README.md                      # Setup and architecture guide
│       ├── WORKFLOW_DOCUMENTATION.md      # Detailed workflow documentation
│       └── TITAN_AGENT_PROMPTS.md         # Complete agent prompt templates
│
├── vitest.config.ts                       # Root Vitest configuration (backend only)
├── DEPLOYMENT_DOKPLOY.md                  # Dokploy deployment guide
└── CLAUDE.md                              # This file (Claude integration guide)
```

---

## Testing

The AI Product Factory includes comprehensive test suites for both backend integration tests and frontend component tests using Vitest.

### Test Structure

```
ai-product-factory/
├── vitest.config.ts              # Root config - backend tests only
├── vitest.integration.config.ts  # Integration test config
├── vitest.e2e.config.ts          # E2E test config
├── tests/
│   ├── backend.test.ts           # Backend unit tests (9 tests)
│   ├── production-parity.test.ts # Production parity tests
│   ├── integration/              # Integration test suite (79 tests)
│   │   ├── setup.ts              # Integration test setup
│   │   ├── 01-file-upload.test.ts
│   │   ├── 02-project-creation.test.ts
│   │   ├── 03-governance-flow.test.ts
│   │   ├── 04-phase-transitions.test.ts
│   │   ├── 05-artifact-storage.test.ts
│   │   ├── 06-error-recovery.test.ts
│   │   └── 07-state-resumption.test.ts
│   ├── helpers/                  # Test utilities
│   │   ├── db-helpers.ts         # Database operations
│   │   ├── s3-helpers.ts         # S3 operations
│   │   └── test-fixtures.ts      # Test data generators
│   └── mocks/                    # Mock servers
│       ├── mock-n8n-server.ts    # Mock n8n webhooks
│       └── governance-payloads.ts
└── frontend/
    ├── vitest.config.ts          # Frontend config - React component tests
    └── tests/
        ├── setup.ts              # Radix UI mocks and test setup
        ├── GovernanceWidget.test.tsx  # Component tests (24 tests)
        └── request-context.test.ts    # Request context tests (26 tests)
```

**Total Tests:** 500+ (79 integration + 50 frontend + 9 backend + E2E tests)

### Running Tests

```bash
# Run all backend tests (from project root)
npm run test:backend

# Run all frontend tests (from project root)
npm run test:frontend

# Run integration tests (requires Docker test environment)
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run all tests
npm run test:all

# Frontend tests directly (from frontend directory)
cd frontend && npm run test

# Watch mode for development
npm run test:watch              # Backend
cd frontend && npm run test:watch  # Frontend

# Run with coverage
npm run test:coverage
```

### Backend Integration Tests

The backend tests in `tests/backend.test.ts` verify integration with n8n, PostgreSQL, and S3/SeaweedFS.

#### Service Availability Detection

Backend tests gracefully skip when Docker services aren't running:

```typescript
// Service availability flags
let n8nAvailable = false;
let postgresAvailable = false;
let s3Available = false;

// Quick connectivity check with timeout
async function checkN8nConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${N8N_WEBHOOK_URL}/healthz`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
```

#### Timeout Wrapper Pattern

Tests use a timeout wrapper to prevent hanging when services are unavailable:

```typescript
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  clearTimeout(timeoutId!);
  return result;
}

// Usage in beforeAll:
const [n8nResult, pgResult, s3Result] = await Promise.all([
  withTimeout(checkN8nConnectivity(), 3000),
  withTimeout(checkPostgresConnectivity(), 3000),
  withTimeout(checkS3Connectivity(s3Client), 3000),
]);
```

#### Test Categories

| Test Suite | Tests | Purpose |
|------------|-------|---------|
| **n8n Webhook Handshake** | 2 | Verify webhook endpoints accept/reject requests |
| **Database Integrity** | 3 | Validate schema, defaults, foreign keys |
| **S3 Connectivity** | 3 | Test file upload, verification, error handling |
| **Governance Webhook** | 1 | Verify governance batch payload contract |

### Frontend Component Tests

Frontend tests in `frontend/tests/` use React Testing Library with Vitest.

#### Test Setup (setup.ts)

The setup file mocks browser APIs required by Radix UI components:

```typescript
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest with jest-dom matchers
expect.extend(matchers);

// Mock ResizeObserver for Radix UI components
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock IntersectionObserver for Radix UI components
class IntersectionObserverMock {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

globalThis.ResizeObserver = ResizeObserverMock;
globalThis.IntersectionObserver = IntersectionObserverMock;

// Mock matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollIntoView for Radix UI components
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => { cleanup(); });
```

#### Frontend Vitest Configuration

The frontend has its own Vitest config to use React 18 (separate from root's React 19):

```typescript
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, './tests/setup.ts')],  // Absolute path
    include: ['tests/**/*.test.tsx'],
    exclude: ['node_modules/**'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

#### GovernanceWidget Test Suite

Tests for the Tech Stack Configurator component:

| Test Category | Tests | Purpose |
|---------------|-------|---------|
| **Rendering** | 5 | Verify table renders technologies, badges, confidence |
| **Alternative Selection** | 2 | Test dropdown selection and scope switching |
| **Batch Actions** | 2 | Verify Approve All, Skip All buttons |
| **Contract - Confirm Payload** | 2 | Validate output matches Zod schema exactly |
| **Edge Cases** | 3 | Empty stack, loading state, disabled state |

### Test Configuration Details

#### Root Vitest Config (backend only)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'frontend/**'],  // Exclude frontend
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend'),
    },
  },
});
```

#### Why Separate Configs?

The project uses **React 18** in frontend but has **React 19** installed at the root level (from other dependencies). Running frontend tests from the root would cause version mismatch errors:

```
Error: A React Element from an older version of React was rendered
```

Separating configs ensures each test suite uses the correct React version.

### Troubleshooting Test Failures

#### Backend Tests Timing Out

**Symptom**: Tests hang for 30s then timeout

**Cause**: Docker services (PostgreSQL, n8n, SeaweedFS) not running

**Solution**: Tests gracefully skip when services are unavailable. Start Docker if you need full integration tests:
```bash
docker-compose up -d postgres seaweedfs n8n
```

#### Frontend Tests: "Cannot find module './tests/setup.ts'"

**Symptom**: Vitest can't locate setup file

**Cause**: Relative path resolution from wrong directory

**Solution**: Use absolute path in vitest.config.ts:
```typescript
setupFiles: [path.resolve(__dirname, './tests/setup.ts')]
```

#### Frontend Tests: "ResizeObserver is not defined"

**Symptom**: Radix UI components throw errors about missing browser APIs

**Cause**: JSDOM doesn't include these APIs

**Solution**: Add mocks in setup.ts (see setup code above)

#### Frontend Tests: Buttons/Elements Not Found

**Symptom**: `getByRole` or `getByText` fails to find elements

**Cause**: Lucide React icons don't add expected class names

**Solution**: Use class-based filtering instead of SVG queries:
```typescript
// Instead of: btn.querySelector('svg.lucide-globe')
// Use: btn.className.includes('h-8') && btn.className.includes('w-8')
```

#### State Update Timing Issues

**Symptom**: Assertions fail because React hasn't re-rendered yet

**Solution**: Wrap assertions in `waitFor`:
```typescript
await waitFor(() => {
  expect(screen.getByText(/3 approved/i)).toBeInTheDocument();
});
```

### Testing Best Practices

This section documents testing requirements for all code changes. **Every feature and fix must have corresponding tests.**

#### Critical Testing Requirements

| Scenario | Test Type | Why It Matters |
|----------|-----------|----------------|
| **Fresh instance deployment** | Integration | Catches credential/migration issues that don't appear in warm environments |
| **Failure/catch paths** | Unit | Variables may be inaccessible in catch blocks; error messages may not extract properly |
| **Database constraints** | Unit | NULL constraints and foreign keys may fail silently in mocks |
| **External API errors** | Unit | APIs return structured errors (400, 401, 500) that need proper extraction |
| **Environment differences** | E2E | Local dev has state that production won't have |

#### Test Categories Checklist

When adding or modifying code, ensure these test categories are covered:

```markdown
## Pre-Commit Testing Checklist

### Happy Path Tests
- [ ] Feature works with valid input
- [ ] Database records created/updated correctly
- [ ] API responses match expected schema

### Failure Path Tests (CRITICAL)
- [ ] Invalid input returns proper error
- [ ] External API failures are handled gracefully
- [ ] Catch blocks have access to required variables
- [ ] Error messages are human-readable (not [object Object])
- [ ] Database upserts use fallback values for required fields

### Fresh Instance Tests
- [ ] Feature works without pre-existing credentials
- [ ] Feature works without pre-existing database records
- [ ] Migrations run correctly on empty database
- [ ] No hardcoded IDs that won't exist in production

### Edge Cases
- [ ] Empty input handled
- [ ] Large input handled
- [ ] Concurrent requests handled
- [ ] Retry logic works correctly
```

#### Lessons Learned (2026-01-18)

**Issue**: Workflow imports failed on fresh Dokploy deployment but worked locally.

**Root Causes**:
1. **Credential references**: Workflows contained credential IDs from source n8n instance that didn't exist on fresh instance → n8n returned 400
2. **Variable scoping**: `workflow.name` declared inside `try` block was inaccessible in `catch` block → NULL constraint violation
3. **Error logging**: `[object Object]` logged instead of actual error message → Debugging was difficult

**Solution**: Added tests for:
- Credential stripping before import
- Catch block variable accessibility
- Error message extraction from API responses

**Test Example** (catch block variable accessibility):
```typescript
it('should set workflow_name in database even when import fails', async () => {
  mockCreateWorkflow.mockRejectedValue(new Error('n8n API error'));

  await importWorkflow('test.json', { configOverride: mockN8nConfig });

  // Verify upsert was called with workflow_name (not NULL)
  expect(mockExecute).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO workflow_registry'),
    expect.arrayContaining([
      'test.json',           // workflow_file
      'Test Workflow',       // workflow_name - should NOT be null
    ])
  );
});
```

**Test Example** (credential stripping):
```typescript
it('should strip credentials from workflow nodes by default', async () => {
  mockReadFile.mockResolvedValue(credentialsWorkflowStr);

  const result = await readWorkflowFile('credentials.json');

  // Credentials should be stripped by default
  const nodesWithCreds = result.workflow.nodes.filter(
    (n) => n.credentials && Object.keys(n.credentials).length > 0
  );
  expect(nodesWithCreds).toHaveLength(0);
});
```

#### Writing Effective Tests

**DO:**
- Test failure paths with mocked errors
- Verify database calls include all required fields
- Use `expect.arrayContaining()` to verify specific values in DB upserts
- Test with realistic error objects (statusCode, response body)
- Add comments explaining what bug the test prevents

**DON'T:**
- Assume "warm" environment state exists
- Only test happy paths
- Skip testing catch blocks because "they rarely run"
- Use generic error assertions like `expect(result.error).toBeDefined()`

### Adding New Tests

#### Backend Integration Test

```typescript
// tests/backend.test.ts
describe('Test X: New Feature', () => {
  beforeEach(() => {
    if (!serviceAvailable) {
      console.log('   ⏭️  Skipping: service not available');
    }
  });

  it('should do something', async () => {
    if (!serviceAvailable) return;  // Skip gracefully

    // Your test logic here
  });
});
```

#### Frontend Component Test

```typescript
// frontend/tests/MyComponent.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from '../components/MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent prop="value" />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const user = userEvent.setup();
    const mockHandler = vi.fn();

    render(<MyComponent onAction={mockHandler} />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockHandler).toHaveBeenCalled();
    });
  });
});
```

### CI/CD Integration

Tests run automatically in GitHub Actions on push/PR:

```yaml
# .github/workflows/deploy.yml
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:backend
      - run: npm run test:frontend
```

### Docker Test Environment

A self-contained Docker Compose test environment is available for running full integration tests locally.

#### Test Environment Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **PostgreSQL** | `postgres:16-alpine` | 5432 | Database with init scripts |
| **SeaweedFS** | `chrislusf/seaweedfs:latest` | 8888 | S3-compatible object storage |
| **n8n** | `n8nio/n8n:latest` | 5678 | Workflow engine |

#### Test Commands

| Command | Description |
|---------|-------------|
| `npm run test:env:up` | Start test environment (PostgreSQL, SeaweedFS, n8n) |
| `npm run test:env:down` | Stop and cleanup test environment |
| `npm run test:env:logs` | View test environment logs |
| `npm run test:env:status` | Check test environment status |
| `npm run test:all` | Full test cycle: start → test → cleanup |
| `npm run test:backend` | Run backend tests only |
| `npm run test:frontend` | Run frontend tests only |
| `npm run test:integration` | Start env, run backend tests, cleanup |

#### Running the Full Test Suite

```bash
# Option 1: Automated full cycle (recommended)
npm run test:all

# Option 2: Manual control
npm run test:env:up         # Start services
npm run test:backend        # Run backend tests
npm run test:frontend       # Run frontend tests
npm run test:env:down       # Cleanup
```

#### Docker Compose Test Configuration

**File:** `docker-compose.test.yml`

```yaml
services:
  postgres-test:
    image: postgres:16-alpine
    container_name: pf-postgres-test
    environment:
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: n8n
      POSTGRES_DB: n8n
    ports:
      - "5432:5432"
    volumes:
      - ./init-scripts:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n -d n8n"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  seaweedfs-test:
    image: chrislusf/seaweedfs:latest
    container_name: pf-seaweedfs-test
    command: server -s3 -s3.port=8333 -master.volumeSizeLimitMB=100
    ports:
      - "8888:8333"
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8333/status"]
      interval: 5s
      timeout: 5s
      retries: 10

  n8n-test:
    image: n8nio/n8n:latest
    container_name: pf-n8n-test
    environment:
      - N8N_BASIC_AUTH_ACTIVE=false
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres-test
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=n8n
    ports:
      - "5678:5678"
    depends_on:
      postgres-test:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:5678/healthz"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s
```

#### Test Runner Script

The `scripts/run-tests.sh` script provides a complete automated test cycle:

1. **Dependency check** - Verifies Docker and npm are installed
2. **Cleanup** - Removes any existing test containers
3. **Start services** - Launches Docker Compose test environment
4. **Health checks** - Waits for all services to be healthy
5. **Backend tests** - Runs Vitest backend integration tests
6. **Frontend tests** - Runs Vitest frontend component tests
7. **Summary** - Reports pass/fail status
8. **Cleanup** - Tears down test environment on exit

#### S3 Bucket Auto-Creation

The backend tests automatically create the S3 bucket if it doesn't exist:

```typescript
async function checkS3Connectivity(s3Client: S3Client): Promise<boolean> {
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
    return true;
  } catch (createErr: unknown) {
    // BucketAlreadyOwnedByYou or 409 Conflict = bucket exists = connected
    if (errName === 'BucketAlreadyOwnedByYou' || errCode === 409) {
      return true;
    }
    throw createErr;
  }
}
```

#### PostgreSQL pgcrypto Extension

The init script requires the `pgcrypto` extension for `gen_random_bytes()`:

```sql
-- init-scripts/01-project-state.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

#### Graceful Test Skipping

Tests gracefully skip when optional services aren't fully available:

```typescript
// n8n webhook tests skip when no workflows deployed (404)
if (response.status === 404) {
  console.log('⏭️  Skipping: workflow not deployed in test n8n instance');
  return;
}
```

#### Test Results Summary

When running `npm run test:all`, you'll see output like:

```
╔══════════════════════════════════════════════════════════════╗
║     AI Product Factory - Integration Test Suite              ║
╚══════════════════════════════════════════════════════════════╝

[1/6] Checking dependencies... ✓
[2/6] Stopping any existing test containers... ✓
[3/6] Starting test services...
[4/6] Waiting for services to be healthy...
  PostgreSQL: Ready
  SeaweedFS:  Ready
  n8n:        Ready
✓ All services ready

[5/6] Running backend tests...
📋 Backend Integration Tests - Service Availability:
   n8n:        ✅ Available
   PostgreSQL: ✅ Available
   S3:         ✅ Available
✓ Backend tests passed (9 tests)

[6/6] Running frontend tests...
✓ Frontend tests passed (50 tests)

╔══════════════════════════════════════════════════════════════╗
║                     Test Summary                              ║
╚══════════════════════════════════════════════════════════════╝
  All tests passed! ✓ (59 total)
```

### Local Production-Parity Testing

A production-parity Docker Compose environment that **exactly mirrors** the Dokploy production deployment, enabling comprehensive validation of all services, health checks, and Traefik routing before deploying.

#### Purpose

The `docker-compose.local-prod.yml` file solves the problem of configuration drift between local development and production. Key differences it addresses:

| Aspect | Local Dev (`docker-compose.yml`) | Dokploy Production | Local-Prod Testing |
|--------|----------------------------------|-------------------|-------------------|
| **PostgreSQL** | v17 | v18 | v18 ✓ |
| **Traefik** | Self-managed | External (Dokploy) | Local simulation ✓ |
| **Redis Auth** | Enabled | Disabled | Disabled ✓ |
| **Network** | Single | Dual (n8n + dokploy) | Dual ✓ |
| **SeaweedFS** | Entrypoint script | Simple command | Simple command ✓ |
| **Observability** | Included | Not included | Not included ✓ |

#### Services Included (8 total)

| Service | Image | Health Check | Access URL |
|---------|-------|--------------|------------|
| **Traefik** | `traefik:v3.6.7` | `wget` to `/ping` | http://localhost:8080 |
| **n8n** | `n8nio/n8n:next` | `wget` to `/healthz` | http://n8n.localhost |
| **PostgreSQL** | `postgres:18-alpine` | `pg_isready` | localhost:5432 |
| **Redis** | `redis:7.4-alpine` | `redis-cli ping` | localhost:6379 |
| **Qdrant** | `qdrant/qdrant:v1.16` | bash TCP check | localhost:6333 |
| **FalkorDB** | `falkordb/falkordb:latest` | `redis-cli ping` | localhost:6379 |
| **Graphiti** | `zepai/knowledge-graph-mcp:standalone` | `curl` to `/health` | localhost:8000 |
| **SeaweedFS** | `chrislusf/seaweedfs:latest` | `wget` to master:9333 | http://s3.localhost |
| **Frontend** | Built from `./frontend` | `wget` to `/api/health` | http://dashboard.localhost |

#### npm Commands

| Command | Description |
|---------|-------------|
| `npm run test:local-prod:up` | Start all services (builds frontend) |
| `npm run test:local-prod:down` | Stop and cleanup (removes volumes) |
| `npm run test:local-prod:logs` | Stream logs from all services |
| `npm run test:local-prod:status` | Show service health status |
| `npm run test:local-prod:validate` | Run full validation script |
| `npm run test:local-prod:validate:keep` | Validate without cleanup |
| `npm run test:production-parity` | Run validation (alias) |

#### Quick Start

```bash
# 1. Start the environment
npm run test:local-prod:up

# 2. Wait for all services to be healthy (check status)
npm run test:local-prod:status

# 3. Access services in browser
#    - Traefik Dashboard: http://localhost:8080
#    - n8n: http://n8n.localhost
#    - Dashboard: http://dashboard.localhost
#    - S3: http://s3.localhost

# 4. Run validation tests
npm run test:local-prod:validate

# 5. Cleanup when done
npm run test:local-prod:down
```

#### .localhost Domains

Modern browsers automatically resolve `.localhost` domains to `127.0.0.1`, so no `/etc/hosts` configuration is needed:

- `n8n.localhost` → Traefik routes to n8n:5678
- `dashboard.localhost` → Traefik routes to frontend:3000
- `s3.localhost` → Traefik routes to seaweedfs:8333

#### Validation Script

The `scripts/validate-production-parity.sh` script performs comprehensive checks:

1. **Service Startup**: Waits for all 8 services to become healthy
2. **Traefik Routing**: Tests routing to n8n.localhost, dashboard.localhost, s3.localhost
3. **PostgreSQL Version**: Confirms PostgreSQL 18.x is running
4. **S3 Operations**: Creates bucket, uploads file, verifies download
5. **Health Endpoints**: Validates all health check endpoints respond correctly
6. **Service Communication**: Tests internal Docker network connectivity

Example output:
```
╔══════════════════════════════════════════════════════════════╗
║     Production Parity Validation                              ║
╚══════════════════════════════════════════════════════════════╝

[1/6] Starting services...
[2/6] Waiting for health checks...
   ✓ traefik: healthy
   ✓ postgres: healthy
   ✓ redis: healthy
   ✓ qdrant: healthy
   ✓ falkordb: healthy
   ✓ graphiti: healthy
   ✓ seaweedfs: healthy
   ✓ n8n: healthy

[3/6] Testing Traefik routing...
   ✓ n8n.localhost → 200 OK
   ✓ s3.localhost → 200 OK

[4/6] Validating PostgreSQL 18...
   ✓ PostgreSQL 18.x confirmed

[5/6] Testing S3 operations...
   ✓ Bucket created
   ✓ File upload successful
   ✓ File download verified

╔══════════════════════════════════════════════════════════════╗
║                     Validation Summary                        ║
╚══════════════════════════════════════════════════════════════╝
  All checks passed! ✓
  Environment matches Dokploy production configuration.
```

#### Integration Tests

The `tests/production-parity.test.ts` file provides Vitest tests for automated validation:

```bash
# Run integration tests against the local-prod environment
npm run test:local-prod:up
npx vitest run tests/production-parity.test.ts
npm run test:local-prod:down
```

Test categories:
- **Traefik Reverse Proxy**: Dashboard access, routing to services
- **Service Health Checks**: n8n, dashboard, SeaweedFS, Qdrant, Graphiti
- **PostgreSQL Configuration**: Version 18.x validation, database accessibility
- **S3 Operations**: Bucket creation, file upload/download

#### Environment Variables

Copy `.env.local-prod.example` to `.env` for local testing:

```bash
cp .env.local-prod.example .env
```

Key variables:
```bash
# Database
POSTGRES_USER=n8n
POSTGRES_PASSWORD=n8n_test_password
POSTGRES_DB=n8n

# n8n
N8N_ENCRYPTION_KEY=test-encryption-key-32chars!!!

# S3/SeaweedFS
S3_ACCESS_KEY=admin
S3_SECRET_KEY=admin123
S3_BUCKET=product-factory-artifacts

# Auth (for dashboard)
AUTH_SECRET=test-auth-secret-32-characters!!
```

#### Troubleshooting

**Problem: Traefik health check failing**
```
Container unhealthy: traefik
```
**Solution**: The compose file requires `--ping=true` in Traefik command and uses `wget` for health checks:
```yaml
command:
  - "--ping=true"  # Required!
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://localhost:8080/ping > /dev/null 2>&1 || exit 1"]
```

**Problem: .localhost domains not resolving**
```
curl: (6) Could not resolve host: n8n.localhost
```
**Solution**: Most modern browsers support `.localhost` automatically. For curl/wget, add to `/etc/hosts`:
```
127.0.0.1 n8n.localhost dashboard.localhost s3.localhost
```

**Problem: Port 80 already in use**
```
Error: bind: address already in use
```
**Solution**: Stop other services using port 80 (Apache, nginx, another Docker container):
```bash
sudo lsof -i :80
sudo systemctl stop apache2  # or nginx
```

**Problem: Graphiti takes too long to start**
```
Container starting: graphiti (90s start_period)
```
**Solution**: This is expected. Graphiti needs ~60-90 seconds to initialize its LLM client and graph connections. The `start_period: 90s` in the compose file accounts for this.

---

## Observability & Logging

The AI Product Factory includes comprehensive structured logging and request tracing for production observability.

### Structured Logging

All API routes use structured JSON logging in production and human-readable colored logs in development.

**Logger Configuration** (`frontend/lib/logger.ts`):

```typescript
import { logger, Logger } from '@/lib/logger';

// Create contextual loggers
const log = logger.child({ component: 'my-feature' });
log.info('Operation completed', { userId, projectId });
log.error('Operation failed', error, { context: 'additional data' });
```

**Log Levels:**
- `debug` - Detailed debugging information (development only)
- `info` - Normal operational messages
- `warn` - Warning conditions (retries, missing optional config)
- `error` - Error conditions requiring attention

**Environment Variables:**
- `LOG_LEVEL` - Minimum log level (default: `debug` in dev, `info` in prod)
- `NODE_ENV` - Determines output format (JSON in production, colored in development)
- `ENABLE_TEST_LOGS` - Enable logs during test runs (disabled by default)

### Correlation IDs & Request Tracing

Every API request gets a correlation ID for distributed tracing across services.

**Request Context Pattern** (`frontend/lib/request-context.ts`):

```typescript
import {
  createRequestContext,
  logRequestStart,
  logRequestComplete,
  logRequestError,
  withCorrelationId,
} from '@/lib/request-context';

// In API route handler
POST: async ({ request }) => {
  const startTime = Date.now();
  const ctx = createRequestContext(request);
  const log = ctx.logger.child({ operation: 'my-operation' });

  logRequestStart(ctx);

  try {
    // ... handler logic
    const response = Response.json({ success: true });
    logRequestComplete(ctx, 200, Date.now() - startTime);
    return withCorrelationId(response, ctx.correlationId);
  } catch (error) {
    logRequestError(ctx, error, 500);
    return withCorrelationId(errorResponse, ctx.correlationId);
  }
}
```

**Correlation ID Sources** (in priority order):
1. `x-correlation-id` header
2. `x-request-id` header
3. `traceparent` header (W3C Trace Context)
4. Auto-generated UUID

**Response Headers:**
All API responses include `x-correlation-id` header for client-side tracing.

### Log Output Formats

**Production (JSON):**
```json
{
  "timestamp": "2026-01-15T10:30:45.123Z",
  "level": "info",
  "message": "Request completed",
  "context": {
    "correlationId": "abc123",
    "method": "POST",
    "path": "/api/start-project",
    "statusCode": 200,
    "durationMs": 245
  }
}
```

**Development (Colored):**
```
[10:30:45] INFO  Request completed {"correlationId":"abc123","statusCode":200}
```

### Retry Logic & Error Handling

The `fetchWithRetry` function provides resilient HTTP calls with structured logging:

```typescript
import { fetchWithRetry, RetryOptions } from '@/lib/n8n';

const options: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  timeoutMs: 60000,
  logger: log,  // Optional structured logger
  onRetry: (error, attempt) => {
    log.warn('Retry attempt', { attempt, error: error.message });
  },
};

const response = await fetchWithRetry(url, fetchOptions, options);
```

**Retryable Errors:**
- Network errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT)
- Server errors (5xx status codes)
- Timeout errors

**Non-Retryable:**
- Client errors (4xx status codes)
- Validation errors

### Monitoring Integration

Structured logs can be aggregated by log management systems:

| System | Integration |
|--------|-------------|
| **Grafana Loki** | JSON logs parsed automatically |
| **ELK Stack** | Use Filebeat with JSON parsing |
| **Datadog** | Auto-detect JSON format |
| **CloudWatch** | Native JSON log insights |

**Recommended Dashboards:**
- Request latency by endpoint
- Error rate by correlation ID
- Retry counts by service
- Active project workflows

---

## AI Product Factory - Human-in-the-Loop Workflow

The **AI Product Factory** is an advanced workflow system that builds on Titan's patterns to provide a fully human-in-the-loop product development lifecycle. It features multi-model agent routing, state-aware resumability, and strict tech governance.

### Key Differences from Titan

| Feature | Titan | AI Product Factory |
|---------|-------|-------------------|
| **Storage** | Google Drive | S3/SeaweedFS (cloud-independent) |
| **Model Routing** | Single provider (OpenRouter) | Multi-model via OpenRouter (Claude + GPT-4o + Perplexity) |
| **Human Interaction** | Checkpoints only | Batch governance UI (Tech Stack Configurator) |
| **Resumability** | Manual | Automatic state persistence with Smart Start |
| **Research** | None | Perplexity Sonar for fact-checking and risk research |
| **Score Threshold** | 0-10 scale | 0-100 scale (more granular) |
| **File Upload** | External (Google Drive) | Integrated drag-and-drop with presigned URLs |

### AI Product Factory Architecture

```mermaid
flowchart TB
    User[User Input] --> SmartStart[Smart Start Handler]

    SmartStart --> CheckResume{Resume?}
    CheckResume -->|Yes| LoadState[Load Project State]
    CheckResume -->|No| NewProject[Initialize New Project]

    LoadState --> ResumePhase[Resume from Saved Phase]
    NewProject --> Phase0

    subgraph Phase0[Phase 0: Scavenging]
        Scan[Scan Documents] --> Extract[Scavenger Agent<br/>Claude 3.5 Sonnet]
        Extract --> Governance[Tech Governance<br/>Human Approval]
        Governance --> Store[Store in Graphiti/Qdrant]
    end

    Phase0 --> Phase1

    subgraph Phase1[Phase 1: Vision Loop]
        V_Create[Visionary<br/>Claude 3.5 Sonnet] --> V_Critique[Critic<br/>GPT-4o + Perplexity]
        V_Critique --> V_Check{Score >= 90?}
        V_Check -->|No| V_Refine[Refiner<br/>Claude 3.5 Sonnet]
        V_Refine --> V_Critique
        V_Check -->|Yes| V_Done[Vision Complete]
    end

    Phase1 --> Phase2

    subgraph Phase2[Phase 2: Architecture Loop]
        A_Create[Architect<br/>Claude 3.5 Sonnet] --> A_Validate[Dr. Doom<br/>GPT-4o]
        A_Validate --> A_Research{Risks Need Research?}
        A_Research -->|Yes| A_Fix[Fixer<br/>Perplexity Sonar]
        A_Fix --> A_Check
        A_Research -->|No| A_Check{Score >= 90?}
        A_Check -->|No| A_Refine[Refiner<br/>Claude 3.5 Sonnet]
        A_Refine --> A_Validate
        A_Check -->|Yes| A_Done[Architecture Complete]
    end

    Phase2 --> Output[Final Artifacts]

    style Phase0 fill:#e8f5e9
    style Phase1 fill:#e3f2fd
    style Phase2 fill:#fff3e0
```

### AI Product Factory Agents ("Dream Team")

| Agent | Model (via OpenRouter) | Temperature | Purpose |
|-------|------------------------|-------------|---------|
| **Visionary** | `anthropic/claude-sonnet-3.5` | 0.7 | Draft Product Vision with JTBD analysis |
| **Architect** | `anthropic/claude-sonnet-3.5` | 0.5 | Design ARC42 architecture |
| **Critic** | `openai/gpt-4o` | 0.3 | Red-team analysis with fact-checking |
| **Dr. Doom** | `openai/gpt-4o` | 0.2 | Pre-mortem risk analysis |
| **Scavenger** | `anthropic/claude-sonnet-3.5` | 0.2 | Extract tech constraints from docs |
| **Refiner** | `anthropic/claude-sonnet-3.5` | 0.5 | Improve based on feedback |
| **Fixer** | `perplexity/sonar` | 0.5 | Research best practices for risks |

### AI Product Factory Workflows

#### 1. Main Orchestrator

**File**: `ai-product-factory-main-workflow.json`

**Entry Point**: Chat Trigger with file upload support

**Smart Start Features**:
- Greeting on empty conversation
- Project creation via Dashboard UI
- "Resume" keyword detection
- Project state persistence in S3 and PostgreSQL

#### 2. Context Scavenging (Phase 0)

**File**: `ai-product-factory-scavenging-subworkflow.json`

**Features**:
- Document batch processing from S3 input folder
- Technical standard extraction with Claude
- **Batch Governance UI**: GovernanceWidget renders in chat for bulk approval
- Perplexity enrichment with 3 alternatives per technology
- Graphiti and Qdrant storage with scope metadata

**Governance Payload** (sent to Dashboard):
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
      "alternatives": [
        { "name": "MySQL", "description": "Alternative RDBMS" },
        { "name": "CockroachDB", "description": "Distributed SQL" }
      ]
    }
  ],
  "webhook_url": "https://n8n.example.com/webhook/governance-batch"
}
```

#### 3. Vision Adversarial Loop (Phase 1)

**File**: `ai-product-factory-vision-loop-subworkflow.json`

**Adversarial Pattern**:
1. **Visionary** (Claude) → Creates Product Vision draft
2. **Critic** (GPT-4o) → Evaluates with Perplexity fact-checking
3. **Refiner** (Claude) → Improves based on feedback
4. Iterates until score >= 90 or max iterations (5)

**Circuit Breaker**: After 5 iterations, asks human for guidance:
- Accept current version
- Provide specific guidance
- Lower threshold
- Start over

#### 4. Architecture Adversarial Loop (Phase 2)

**File**: `ai-product-factory-architecture-loop-subworkflow.json`

**Enhanced Pattern**:
1. **Architect** (Claude) → Creates ARC42 document
2. **Dr. Doom** (GPT-4o) → Pre-mortem risk analysis
3. **Fixer** (Perplexity) → Researches mitigation for flagged risks
4. **Refiner** (Claude) → Applies fixes and improvements
5. Iterates until score >= 90

**Tech Stack Compliance**: Architect MUST use only approved technologies from Graphiti.

#### 5. Perplexity Research Tool

**File**: `ai-product-factory-perplexity-research-subworkflow.json`

**Research Types**:
- `fact_check`: Verify claims with sources
- `market_research`: Market trends and data
- `best_practices`: Industry best practices
- `risk_mitigation`: Mitigation strategies
- `competitive_analysis`: Competitor intelligence

#### 6. Decision Logger

**File**: `ai-product-factory-decision-logger-subworkflow.json`

**Operations**:
- `log_decision`: Tech standard discoveries
- `log_iteration`: Adversarial loop iterations
- `log_approval`: Human approvals
- `log_phase_start/end`: Phase lifecycle
- `log_governance_batch`: Batch governance decisions (new)

### AI Product Factory Prerequisites

#### Required Credentials

| Credential | Type | Purpose |
|------------|------|---------|
| `OpenRouter API` | OpenRouter | All LLM agents (Claude, GPT-4o, Perplexity) |
| `OpenAI API Header` | HTTP Header | Embeddings for Qdrant |
| `Zep Api account` | Zep | Agent memory |

> **Note**: S3/SeaweedFS access is configured via environment variables, not credentials.

#### Environment Variables

```bash
# Service URLs
GRAPHITI_URL=http://graphiti:8000
QDRANT_URL=http://qdrant:6333

# S3/SeaweedFS Configuration
S3_ENDPOINT=http://seaweedfs:8333
S3_BUCKET=product-factory-artifacts
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key

# Workflow Configuration
FACTORY_MAX_ITERATIONS=5
FACTORY_SCORE_THRESHOLD=90
FACTORY_BATCH_SIZE=3
FACTORY_CONFIRMATION_TIMEOUT=3600

# Memory Configuration (messages per agent)
FACTORY_MEMORY_VISIONARY=8
FACTORY_MEMORY_CRITIC=6
FACTORY_MEMORY_REFINER=10
FACTORY_MEMORY_ARCHITECT=10
```

### Using AI Product Factory

#### Starting a New Project

**Via Dashboard (Recommended)**:
1. Navigate to `/projects/new`
2. Enter project name (e.g., "ShopFast")
3. Optionally add a description
4. Drag and drop your source documents (PDF, MD, DOCX, TXT)
5. Click "Start Project"
6. The workflow automatically begins processing

**Via API**:
```bash
curl -X POST https://dashboard.example.com/api/start-project \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "ShopFast",
    "projectId": "shopfast-abc123",
    "description": "E-commerce platform",
    "inputFiles": [
      { "key": "projects/shopfast/input/requirements.pdf", "name": "requirements.pdf", "size": 245000, "contentType": "application/pdf" }
    ]
  }'
```

#### Tech Standard Approval Flow (Batch Governance)

When Phase 0 discovers tech standards, a **GovernanceWidget** appears in the chat:

```
┌─────────────────────────────────────────────────────────────┐
│  Tech Stack Configurator - ShopFast                         │
├─────────────────────────────────────────────────────────────┤
│  Name         │ Category  │ Source              │ Confidence│
│  PostgreSQL   │ database  │ architecture.md     │ 95%       │
│    └─ Alternatives: MySQL, CockroachDB, SQLite              │
│  React        │ framework │ tech-standards.md   │ 92%       │
│    └─ Alternatives: Vue, Svelte, Angular                    │
│  TypeScript   │ language  │ coding-standards.md │ 98%       │
│    └─ Alternatives: JavaScript, Flow                        │
├─────────────────────────────────────────────────────────────┤
│  [Approve All (Global)] [Approve All (Local)] [Skip All]    │
│                                        [Confirm Selections] │
└─────────────────────────────────────────────────────────────┘
```

Users can:
- Select alternatives from the dropdown for each technology
- Choose scope: Global (all projects) or Local (this project only)
- Skip technologies they don't want to approve
- Use batch actions for quick approval

#### Resuming a Project

```
User: "Resume"

AI: "Found existing project: **ShopFast**

     Current Status:
     - Phase: 1 - Product Vision Loop
     - Status: in_progress
     - Last Score: 78/100

     Would you like to:
     1. Resume from Phase 1
     2. Start over
     3. Work on a different project"
```

### AI Product Factory Output Artifacts

**S3 Storage Structure**:
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
    │       ├── Vision_v2_FINAL.md
    │       ├── Architecture_v1.md
    │       ├── Architecture_v1_risks.json
    │       └── Architecture_v2_FINAL.md
    └── standards/
        ├── global_standards.json
        └── local_standards.json
```

### Modifying Workflows

#### Editing Agent Behavior

To customize agent prompts:

1. **Read the current prompts**: See `workflows/TITAN_AGENT_PROMPTS.md`
2. **Edit in n8n**:
   - Open the workflow containing the agent
   - Find the "AI Agent" node for that agent
   - Modify the "System Message" field
   - Save and test
3. **Document changes**: Update `TITAN_AGENT_PROMPTS.md` with your changes

#### Adding New Agents

1. **Create AI Agent node** in n8n
2. **Configure model**:
   - Choose appropriate model (GPT-4, GPT-4o-mini, Claude Opus)
   - Set temperature (0.2 for analytical, 0.7 for creative)
3. **Add memory** (if needed):
   - Window Buffer Memory for conversation context
   - Simple Memory for stateless operations
4. **Attach tools** (optional):
   - Connect Graphiti subworkflow as a tool
   - Connect Qdrant subworkflow as a tool
5. **Test independently** before integrating

#### Modifying Workflow Logic

Common modifications:

**Change iteration limits**:
- Edit "Increment Iteration" node in adversarial loop
- Modify the `maxIterations` variable (default: 5)

**Adjust quality thresholds**:
- Edit "Check Score" node in adversarial loop
- Modify the score comparison (default: ≥ 9.0)

**Add checkpoints**:
- Insert Wait nodes for user confirmation
- Useful for reviewing intermediate outputs

**Change model selection**:
- Edit "Chat Model" nodes in each agent
- Switch between GPT-4, GPT-4o-mini, or Claude Opus

### Testing Changes

Run the comprehensive test suite:

```bash
# Run all tests
npm run test:all

# Run integration tests only
npm run test:integration

# Run frontend tests only
npm run test:frontend
```

#### Unit Tests (Individual Components)
1. Test each subworkflow independently
2. Verify input validation logic
3. Check error handling paths
4. Validate output format

#### Integration Tests (Full Workflow)
1. Run `npm run test:integration` (79 tests)
2. Monitor execution logs for errors
3. Verify all phases complete successfully
4. Check output quality

#### Regression Tests (After Changes)
1. Run `npm run test:all`
2. Compare outputs with baseline
3. Verify no degradation in quality scores
4. Check execution time hasn't increased significantly

### Version History

See `EXPERT_CONTEXT.md` for comprehensive system documentation and `workflows/README.md` for workflow-specific changes.

**Recent Versions**:
- **v3.0.2** (2026-01-18): **Integration Test Suite & Documentation** - Complete 79 integration tests covering file upload, project creation, governance flow, phase transitions, artifact storage, error recovery, and state resumption. Created comprehensive `EXPERT_CONTEXT.md` with full tech stack, architecture, and product vision. Documentation cleanup removing outdated files.
- **v3.0.1** (2026-01-16): **Resilient Database Queries** - Fix for `is_setup_complete() does not exist` error on database upgrades. Added PostgreSQL error detection helpers (`isPostgresUndefinedFunctionError`, `isPostgresUndefinedTableError`) and fallback implementations that query tables directly when DB functions/views don't exist. 421 tests passing including 32 new settings tests.
- **v3.0.0** (2026-01-16): **Setup Wizard for n8n Integration** - 6-step guided wizard (`/setup/*` routes), n8n API client for workflow import, encrypted API key storage (AES-256-GCM), settings management (`/settings/n8n`), database schema for app_settings and workflow_registry, 390 tests passing
- **v2.9.0** (2026-01-15): Frontend UI/UX improvements - route error boundaries (`RouteErrorBoundary`), loading skeletons (`ProjectDetailSkeleton`, `ProjectListSkeleton`, `FormSkeleton`), toast notifications (Sonner), Alert components with variants, AlertDialog for confirmations, `components.json` for shadcn CLI
- **v2.8.4** (2026-01-15): n8n auto-bootstrap on first deployment (`n8n-entrypoint.sh`), workflow verification in CI/CD, post-deployment verification script
- **v2.8.3** (2026-01-15): Local production-parity testing environment (`docker-compose.local-prod.yml`), Traefik simulation for Dokploy, validation scripts
- **v2.8.2** (2026-01-15): Structured logging with correlation IDs, request-context utilities, comprehensive test coverage (59 tests)
- **v2.8.1** (2026-01-15): Security hardening, input validation with Zod schemas, database schema updates for chat messages
- **v2.8.0** (2026-01-14): Added Error Trigger nodes to all adversarial loops, S3 retry configuration, diagnostic audit tooling
- **v2.7.0** (2026-01-14): S3-only storage migration, removed Google Drive dependency
- **v2.6.0** (2026-01-14): Batch governance UI (Tech Stack Configurator), Generative UI components
- **v2.5.0** (2026-01-14): File upload with presigned URLs, drag-and-drop interface
- **v2.4.0** (2026-01-14): API workflow for dashboard integration
- **v2.3.0** (2026-01-13): Fixed user confirmation flow (Form → Wait nodes)
- **v2.2.0** (2026-01-13): Fixed subworkflow connections and integration issues
- **v2.1.0** (2026-01-13): Qdrant integration, error handling, telemetry
- **v2.0.0** (2026-01-13): AI Agent conversion from HTTP-based system
- **v1.0.0** (2026-01-12): Initial release with HTTP agents

### Contributing

To contribute improvements:

1. **Test thoroughly**: Run `npm run test:all`
2. **Document changes**: Update relevant markdown files
3. **Export workflows**: Export modified `.json` files from n8n
4. **Version appropriately**: Follow semantic versioning (major.minor.patch)
5. **Share knowledge**: Update this `CLAUDE.md` with new patterns

---

## Cost & Performance Metrics

### API Cost Breakdown (per full workflow run)

| Component | Model | Est. Tokens | Cost |
|-----------|-------|-------------|------|
| **Scavenger** | Claude Sonnet 3.5 | 10K input + 5K output | $0.005 |
| **Creator** (3 iterations) | Claude Sonnet 3.5 | 30K input + 15K output | $0.022 |
| **Critic** (3 iterations) | Claude Sonnet 3.5 | 20K input + 5K output | $0.015 |
| **Refiner** (3 iterations) | Claude Sonnet 3.5 | 40K input + 20K output | $0.033 |
| **Auditor** | Claude Sonnet 3.5 | 15K input + 5K output | $0.010 |
| **Embeddings** | text-embedding-3-small | 50K tokens | $0.001 |
| **Total** | | | **~$0.10** |

**Cost Optimization**:
- Using Claude Haiku for Scavenger/Auditor: **~$0.06 per run** (40% cost reduction)
- Limiting to 2 iterations: **~$0.07 per run** (30% cost reduction)
- Enable prompt caching: Up to 90% savings on repeated system prompts

### Performance Benchmarks

**Typical Execution Times**:
- **Phase 0 (Scavenger)**: 2-5 minutes
  - Depends on: Number of documents, document size
- **Phase 1 (Vision)**: 5-15 minutes
  - Depends on: Iterations needed (typically 2-3), model speed
- **Phase 2 (Architecture)**: 5-15 minutes
  - Depends on: Iterations needed (typically 2-3), model speed
- **Phase 3 (Audit)**: 1-3 minutes
  - Depends on: Document size, complexity validation

**Quality Metrics**:
- **Average iterations to convergence**: 2.8 (Phase 1), 2.5 (Phase 2)
- **Final quality scores**: 9.0-9.8 (out of 10)
- **Success rate**: 98% (reaches quality threshold within 5 iterations)

**Throughput**:
- **Sequential processing**: 1 project per 15-40 minutes
- **Parallel processing**: Up to 5 projects simultaneously (with sufficient API rate limits)

---

## Quick Reference

### Essential Commands

**Titan Workflows (n8n-mcp)**:
```
Ask Claude: "What's the status of my Titan workflow execution?"
Ask Claude: "Show me all available n8n workflows"
Ask Claude: "Run Titan for project 'X' using folder ID 'Y'"
Ask Claude: "What technical standards are stored about authentication?"
```

**Other MCP Capabilities**:
```
Ask Claude: "Use Playwright to scrape data from [URL]"
Ask Claude: "Use Exa to research [topic]"
Ask Claude: "Use Semgrep to scan this code for vulnerabilities"
Ask Claude: "Use Firecrawl to extract content from [website]"
Ask Claude: "Analyze the codebase architecture using Context7"
```

### Important URLs

- **n8n Instance**: https://c3po.etrox.de
- **OpenAI Platform**: https://platform.openai.com
- **Qdrant Cloud**: https://cloud.qdrant.io
- **n8n Documentation**: https://docs.n8n.io/advanced-ai/
- **OpenAI API Docs**: https://platform.openai.com/docs

### Key File Paths

- **MCP Config (Project)**: `./.mcp.json` (in project root)
- **MCP Config (User)**: `~/.claude.json` or `%USERPROFILE%\.claude.json` (Windows)
- **Workflow Files**: `./workflows/*.json`
- **Documentation**: `./workflows/*.md`
- **This Guide**: `./claude.md`

### Support

For issues or questions:
1. Check this guide's Troubleshooting section
2. Review `EXPERT_CONTEXT.md` for system overview
3. Check `workflows/README.md` for setup details
4. Consult n8n community: https://community.n8n.io

---

## Security Considerations

### MCP Token Security

**API Keys in MCP Configuration**:

The MCP configuration includes several API keys that provide access to external services:

| Service | Key Type | Access Level | Security Priority |
|---------|----------|--------------|-------------------|
| **n8n** | JWT Token | Full API access to workflows | 🔴 Critical |
| **Firecrawl** | API Key | Web scraping credits | 🟡 Medium |
| **Exa** | API Key | Search API usage | 🟡 Medium |
| **Perplexity** | API Key | AI search credits | 🟡 Medium |
| **Ref** | API Key | Documentation access | 🟢 Low |

**Security Best Practices**:

- **Do not commit** `.mcp.json` with tokens to version control (add to `.gitignore`)
- **Rotate tokens regularly** (recommended: every 90 days)
- **Use environment-specific tokens** for development vs production
- **Revoke immediately** if any token is compromised
- **Prefer user-scoped config** (`~/.claude.json`) to keep tokens out of repositories
- **Monitor API usage** for all services to detect unauthorized access
- **Set billing alerts** on services that charge per usage (Firecrawl, Exa, Perplexity)

### API Key Management

- Store OpenAI API keys in n8n credentials (encrypted at rest)
- Use separate API keys for different environments
- Monitor API usage in OpenAI dashboard
- Set up billing alerts to prevent unexpected charges

### Data Privacy

- Documents processed by Titan are sent to OpenAI API
- Embeddings are stored in Qdrant (ensure proper access controls)
- Knowledge graph data in Graphiti (ensure proper access controls)
- Input documents stored in S3/SeaweedFS (ensure bucket policies are configured)

### Best Practices

1. **Least Privilege**: Only grant necessary permissions to service accounts
2. **Audit Logs**: Review n8n execution logs regularly
3. **Secure Communications**: Always use HTTPS for n8n instance
4. **Input Validation**: Titan workflows validate inputs, but verify source data
5. **Output Sanitization**: Review generated documents before sharing externally

---

**Ready to get started?** Configure MCP using the instructions above, then ask Claude to execute your first Titan workflow!
