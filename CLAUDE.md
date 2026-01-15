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

### Version

Current version: **v2.8.0** (2026-01-14)

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
   - Use `workflows/TESTING_CHECKLIST.md`
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

**Docker (Recommended)**:
```bash
docker run -d \
  --name graphiti \
  -p 8080:8080 \
  graphiti/graphiti:latest
```

**Manual Setup**: See https://github.com/getzep/graphiti

#### 2. Qdrant (Vector Database)

Qdrant stores document embeddings for semantic search.

**Setup Options**:

**Docker (Recommended)**:
```bash
docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant:latest
```

**Qdrant Cloud**: https://cloud.qdrant.io (fully managed)

**Manual Setup**: See https://qdrant.tech/documentation/quick-start/

#### 3. SeaweedFS (S3-Compatible Storage)

SeaweedFS provides S3-compatible object storage for all documents and artifacts.

**Setup Options**:

**Docker (Recommended)** - Already included in docker-compose.yml:
```yaml
seaweedfs:
  image: chrislusf/seaweedfs:latest
  command: server -s3 -s3.port=8333
  ports:
    - "8333:8333"
  volumes:
    - seaweedfs_data:/data
```

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

---

## Dashboard Application

The frontend dashboard provides a web-based interface for managing AI Product Factory projects.

### Technology Stack

| Technology | Purpose |
|------------|---------|
| **TanStack Start** | Full-stack React framework with SSR |
| **Better-Auth** | Google OAuth authentication |
| **Shadcn UI** | Component library |
| **TanStack Query** | Data fetching and caching |
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

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check with database connectivity status |
| `/api/auth/*` | GET/POST | Better-Auth authentication routes |
| `/api/start-project` | POST | Create new project and trigger workflow |
| `/api/presigned-url` | POST | Generate S3 presigned URL for file upload |
| `/api/governance` | POST | Submit batch governance decisions |

### Running the Dashboard

```bash
cd frontend
npm install
npm run dev     # Development server on port 3000
npm run build   # Production build
npm run start   # Start production server
```

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
│   │   │   └── governance.ts             # Batch governance endpoint
│   │   └── projects/
│   │       ├── index.tsx                 # Projects list
│   │       ├── new.tsx                   # New project page (drag-drop upload)
│   │       └── $projectId.tsx            # Project detail view
│   ├── components/                        # React components
│   │   ├── adr/                          # ADR Viewer components
│   │   ├── artifacts/                    # Document viewer
│   │   ├── auth/                         # Authentication (UserMenu)
│   │   ├── chat/                         # Chat interface
│   │   ├── governance/                   # Governance UI components
│   │   │   └── GovernanceWidget.tsx      # Tech Stack Configurator
│   │   ├── history/                      # History timeline
│   │   ├── upload/                       # File upload components
│   │   │   └── FileUpload.tsx            # Drag-drop file uploader
│   │   └── ui/                           # Shadcn components
│   ├── lib/                              # Utilities
│   │   ├── auth.ts                       # Better-Auth configuration
│   │   ├── auth-client.ts                # Client-side auth hooks
│   │   ├── db.ts                         # PostgreSQL client
│   │   ├── s3.ts                         # SeaweedFS client (with presigned URLs)
│   │   ├── schemas.ts                    # Zod validation schemas
│   │   ├── n8n.ts                        # n8n webhook client
│   │   └── export.ts                     # ZIP export utility
│   ├── tests/                            # Frontend component tests
│   │   ├── setup.ts                      # Vitest setup with Radix UI mocks
│   │   └── GovernanceWidget.test.tsx     # GovernanceWidget tests (24 tests)
│   ├── vitest.config.ts                  # Frontend Vitest configuration
│   └── types/                            # TypeScript types
├── tests/                                 # Backend integration tests
│   ├── backend.test.ts                   # n8n, PostgreSQL, S3 tests
│   └── setup.ts                          # Test setup (future)
├── scripts/
│   ├── sync-workflows.js                 # n8n workflow sync script
│   ├── run-tests.sh                      # Full test suite runner (Docker + tests)
│   ├── test-sync-dry-run.sh              # Workflow sync dry-run test
│   └── test-migration-idempotency.sh     # Database migration test
├── init-scripts/
│   └── 01-project-state.sql              # Database schema (requires pgcrypto)
├── docker-compose.test.yml               # Test environment (PostgreSQL, SeaweedFS, n8n)
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
│       ├── AI_AGENT_CONVERSION_GUIDE.md   # Technical implementation details
│       ├── CONVERSION_SUMMARY.md          # Change log and version history
│       ├── TESTING_CHECKLIST.md           # QA procedures and test cases
│       └── TITAN_AGENT_PROMPTS.md         # Complete agent prompt templates
│
├── vitest.config.ts                       # Root Vitest configuration (backend only)
├── n8n-mcp-diagnosis.md                   # MCP troubleshooting guide
└── claude.md                               # This file
```

---

## Testing

The AI Product Factory includes comprehensive test suites for both backend integration tests and frontend component tests using Vitest.

### Test Structure

```
ai-product-factory/
├── vitest.config.ts              # Root config - backend tests only
├── tests/
│   └── backend.test.ts           # Backend integration tests (9 tests)
└── frontend/
    ├── vitest.config.ts          # Frontend config - React component tests
    └── tests/
        ├── setup.ts              # Radix UI mocks and test setup
        └── GovernanceWidget.test.tsx  # Component tests (24 tests)
```

### Running Tests

```bash
# Run all backend tests (from project root)
npm run test:backend

# Run all frontend tests (from project root)
npm run test:frontend

# Run frontend tests directly (from frontend directory)
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
✓ Frontend tests passed (24 tests)

╔══════════════════════════════════════════════════════════════╗
║                     Test Summary                              ║
╚══════════════════════════════════════════════════════════════╝
  All tests passed! ✓ (33 total)
```

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

Follow the comprehensive testing checklist in `workflows/TESTING_CHECKLIST.md`:

#### Unit Tests (Individual Components)
1. Test each subworkflow independently
2. Verify input validation logic
3. Check error handling paths
4. Validate output format

#### Integration Tests (Full Workflow)
1. Run complete workflow with test data
2. Monitor execution logs for errors
3. Verify all phases complete successfully
4. Check output quality

#### Regression Tests (After Changes)
1. Run test suite from `TESTING_CHECKLIST.md`
2. Compare outputs with baseline
3. Verify no degradation in quality scores
4. Check execution time hasn't increased significantly

### Version History

See `workflows/CONVERSION_SUMMARY.md` for complete change history.

**Recent Versions**:
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

1. **Test thoroughly**: Use `TESTING_CHECKLIST.md`
2. **Document changes**: Update relevant markdown files
3. **Export workflows**: Export modified `.json` files from n8n
4. **Version appropriately**: Follow semantic versioning (major.minor.patch)
5. **Share knowledge**: Update this `claude.md` with new patterns

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
2. Review `workflows/TESTING_CHECKLIST.md`
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
