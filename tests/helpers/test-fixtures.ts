/**
 * Test fixtures generator for integration tests
 * Generates realistic test data matching Zod schemas
 */

import type {
  InputFile,
  TechItem,
  TechAlternative,
  TechCategory,
  TechType,
  GovernancePayload,
  GovernanceResponse,
  TechDecision,
  ProjectState,
  PhaseStatus,
} from '../../frontend/lib/schemas';

// Unique ID generator for test isolation
export function generateTestId(prefix = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================
// Project Fixtures
// ============================================

export interface TestProject {
  projectId: string;
  projectName: string;
  sessionId: string;
  description?: string;
  inputFiles: InputFile[];
}

/**
 * Create a test project with unique identifiers
 */
export function createTestProject(overrides?: Partial<TestProject>): TestProject {
  const id = generateTestId('project');
  return {
    projectId: id,
    projectName: `Test Project ${id.slice(-8)}`,
    sessionId: generateTestId('session'),
    description: 'Integration test project',
    inputFiles: [],
    ...overrides,
  };
}

/**
 * Create a test input file
 */
export function createTestInputFile(overrides?: Partial<InputFile>): InputFile {
  const id = generateTestId('file');
  return {
    key: `projects/test/input/${id}.txt`,
    name: `${id}.txt`,
    size: 1024,
    contentType: 'text/plain',
    uploadedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create multiple test input files
 */
export function createTestInputFiles(
  count: number = 2,
  projectId: string = 'test-project'
): InputFile[] {
  const types = [
    { ext: 'pdf', contentType: 'application/pdf', size: 245000 },
    { ext: 'md', contentType: 'text/markdown', size: 15420 },
    { ext: 'docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 52340 },
    { ext: 'txt', contentType: 'text/plain', size: 8192 },
  ];

  return Array.from({ length: count }, (_, i) => {
    const type = types[i % types.length];
    const name = `test-doc-${i + 1}.${type.ext}`;
    return createTestInputFile({
      key: `projects/${projectId}/input/${name}`,
      name,
      size: type.size,
      contentType: type.contentType,
    });
  });
}

// ============================================
// Tech Stack Fixtures
// ============================================

const TECH_TEMPLATES: Array<{
  name: string;
  category: TechCategory;
  type: TechType;
  confidence: number;
  alternatives: TechAlternative[];
}> = [
  {
    name: 'PostgreSQL',
    category: 'database',
    type: 'technology',
    confidence: 0.95,
    alternatives: [
      { name: 'MySQL', description: 'Popular open-source relational database' },
      { name: 'CockroachDB', description: 'Distributed SQL database for global scale' },
      { name: 'SQLite', description: 'Lightweight embedded database' },
    ],
  },
  {
    name: 'React',
    category: 'framework',
    type: 'technology',
    confidence: 0.92,
    alternatives: [
      { name: 'Vue.js', description: 'Progressive JavaScript framework' },
      { name: 'Svelte', description: 'Compiler-based frontend framework' },
      { name: 'Angular', description: 'Full-featured TypeScript framework' },
    ],
  },
  {
    name: 'TypeScript',
    category: 'language',
    type: 'technology',
    confidence: 0.98,
    alternatives: [
      { name: 'JavaScript', description: 'Dynamic scripting language' },
      { name: 'Flow', description: 'Static type checker for JavaScript' },
    ],
  },
  {
    name: 'Docker',
    category: 'infrastructure',
    type: 'technology',
    confidence: 0.88,
    alternatives: [
      { name: 'Podman', description: 'Daemonless container engine' },
      { name: 'containerd', description: 'Industry-standard container runtime' },
    ],
  },
  {
    name: 'REST API',
    category: 'integration',
    type: 'pattern',
    confidence: 0.85,
    alternatives: [
      { name: 'GraphQL', description: 'Query language for APIs' },
      { name: 'gRPC', description: 'High-performance RPC framework' },
    ],
  },
  {
    name: 'OAuth 2.0',
    category: 'security',
    type: 'standard',
    confidence: 0.90,
    alternatives: [
      { name: 'SAML', description: 'Security Assertion Markup Language' },
      { name: 'OpenID Connect', description: 'Identity layer on top of OAuth 2.0' },
    ],
  },
  {
    name: 'GDPR Compliance',
    category: 'compliance',
    type: 'requirement',
    confidence: 0.82,
    alternatives: [
      { name: 'CCPA', description: 'California Consumer Privacy Act' },
      { name: 'HIPAA', description: 'Health Insurance Portability and Accountability Act' },
    ],
  },
  {
    name: 'CI/CD Pipeline',
    category: 'development',
    type: 'pattern',
    confidence: 0.87,
    alternatives: [
      { name: 'GitHub Actions', description: 'GitHub-native CI/CD' },
      { name: 'GitLab CI', description: 'GitLab-integrated CI/CD' },
      { name: 'Jenkins', description: 'Self-hosted automation server' },
    ],
  },
];

/**
 * Create a test tech item
 */
export function createTestTechItem(
  index: number,
  overrides?: Partial<TechItem>
): TechItem {
  const template = TECH_TEMPLATES[index % TECH_TEMPLATES.length];
  return {
    id: `tech_${String(index + 1).padStart(3, '0')}`,
    name: template.name,
    type: template.type,
    category: template.category,
    description: `${template.name} detected from project documentation`,
    source: 'architecture.md',
    confidence: template.confidence,
    alternatives: template.alternatives,
    ...overrides,
  };
}

/**
 * Create a tech stack with specified number of items
 */
export function createTestTechStack(count = 3): TechItem[] {
  return Array.from({ length: count }, (_, i) => createTestTechItem(i));
}

// ============================================
// Governance Fixtures
// ============================================

/**
 * Create a governance request payload from n8n
 */
export function createGovernancePayload(
  projectId: string,
  techStack?: TechItem[]
): GovernancePayload {
  const stack = techStack || createTestTechStack(3);
  return {
    type: 'governance_request',
    scavenging_id: generateTestId('scav'),
    project_id: projectId,
    detected_stack: stack,
    webhook_url: `http://localhost:5678/webhook/governance-batch`,
  };
}

/**
 * Create a governance response with all approvals
 */
export function createApproveAllResponse(
  payload: GovernancePayload,
  scope: 'global' | 'local' = 'global'
): GovernanceResponse {
  return {
    scavenging_id: payload.scavenging_id,
    project_id: payload.project_id,
    decisions: payload.detected_stack.map((tech) => ({
      tech_id: tech.id,
      action: 'approve' as const,
      scope,
    })),
    submitted_at: new Date().toISOString(),
  };
}

/**
 * Create a governance response with all skips
 */
export function createSkipAllResponse(
  payload: GovernancePayload
): GovernanceResponse {
  return {
    scavenging_id: payload.scavenging_id,
    project_id: payload.project_id,
    decisions: payload.detected_stack.map((tech) => ({
      tech_id: tech.id,
      action: 'skip' as const,
    })),
    submitted_at: new Date().toISOString(),
  };
}

/**
 * Create a governance response with mixed decisions
 */
export function createMixedDecisionsResponse(
  payload: GovernancePayload
): GovernanceResponse {
  const decisions: TechDecision[] = payload.detected_stack.map((tech, i) => {
    // Cycle through different decision types
    const actions: Array<'approve' | 'skip' | 'reject'> = ['approve', 'skip', 'approve'];
    const action = actions[i % actions.length];

    if (action === 'approve') {
      // Some with alternatives, some without
      const useAlternative = i % 2 === 0 && tech.alternatives && tech.alternatives.length > 0;
      return {
        tech_id: tech.id,
        action: 'approve' as const,
        scope: i % 2 === 0 ? ('global' as const) : ('local' as const),
        selected_alternative: useAlternative ? tech.alternatives![0].name : undefined,
        notes: `Test decision ${i + 1}`,
      };
    }

    return {
      tech_id: tech.id,
      action,
    };
  });

  return {
    scavenging_id: payload.scavenging_id,
    project_id: payload.project_id,
    decisions,
    submitted_at: new Date().toISOString(),
  };
}

/**
 * Create a governance response with alternatives selected
 */
export function createWithAlternativesResponse(
  payload: GovernancePayload
): GovernanceResponse {
  return {
    scavenging_id: payload.scavenging_id,
    project_id: payload.project_id,
    decisions: payload.detected_stack.map((tech) => ({
      tech_id: tech.id,
      action: 'approve' as const,
      scope: 'local' as const,
      selected_alternative:
        tech.alternatives && tech.alternatives.length > 0
          ? tech.alternatives[0].name
          : undefined,
    })),
    submitted_at: new Date().toISOString(),
  };
}

// ============================================
// Project State Fixtures
// ============================================

/**
 * Create a full project state object
 */
export function createProjectState(
  project: TestProject,
  overrides?: Partial<ProjectState>
): ProjectState {
  return {
    project_id: project.projectId,
    project_name: project.projectName,
    session_id: project.sessionId,
    current_phase: 0,
    phase_status: 'pending' as PhaseStatus,
    input_files: project.inputFiles,
    tech_standards_global: [],
    tech_standards_local: [],
    artifact_vision_draft: null,
    artifact_vision_final: null,
    artifact_architecture_draft: null,
    artifact_architecture_final: null,
    artifact_decision_log: null,
    total_iterations: 0,
    total_duration_ms: 0,
    config: {
      max_iterations: 5,
      score_threshold: 90,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create project state at a specific phase
 */
export function createProjectStateAtPhase(
  project: TestProject,
  phase: 0 | 1 | 2 | 3,
  status: PhaseStatus = 'in_progress'
): ProjectState {
  const baseState = createProjectState(project);

  switch (phase) {
    case 0:
      return {
        ...baseState,
        current_phase: 0,
        phase_status: status,
      };
    case 1:
      return {
        ...baseState,
        current_phase: 1,
        phase_status: status,
        tech_standards_global: [
          { name: 'PostgreSQL', category: 'database', source: 'test.md', confidence: 0.95, scope: 'global' },
          { name: 'React', category: 'framework', source: 'test.md', confidence: 0.92, scope: 'global' },
        ],
        artifact_vision_draft: `projects/${project.projectId}/artifacts/Vision_v1.md`,
      };
    case 2:
      return {
        ...baseState,
        current_phase: 2,
        phase_status: status,
        tech_standards_global: [
          { name: 'PostgreSQL', category: 'database', source: 'test.md', confidence: 0.95, scope: 'global' },
          { name: 'React', category: 'framework', source: 'test.md', confidence: 0.92, scope: 'global' },
        ],
        artifact_vision_final: `projects/${project.projectId}/artifacts/ProductVision_FINAL.md`,
        artifact_architecture_draft: `projects/${project.projectId}/artifacts/Architecture_v1.md`,
        total_iterations: 3,
      };
    case 3:
      return {
        ...baseState,
        current_phase: 3,
        phase_status: 'completed',
        tech_standards_global: [
          { name: 'PostgreSQL', category: 'database', source: 'test.md', confidence: 0.95, scope: 'global' },
          { name: 'React', category: 'framework', source: 'test.md', confidence: 0.92, scope: 'global' },
        ],
        artifact_vision_final: `projects/${project.projectId}/artifacts/ProductVision_FINAL.md`,
        artifact_architecture_final: `projects/${project.projectId}/artifacts/Architecture_FINAL.md`,
        artifact_decision_log: `projects/${project.projectId}/artifacts/decision_log.md`,
        total_iterations: 6,
        total_duration_ms: 1200000, // 20 minutes
      };
    default:
      return baseState;
  }
}

// ============================================
// API Request Fixtures
// ============================================

/**
 * Create start project API request body
 */
export function createStartProjectRequest(
  project: TestProject
): {
  projectName: string;
  projectId?: string;
  description?: string;
  inputFiles: Array<{
    key: string;
    name: string;
    size: number;
    contentType: string;
  }>;
} {
  return {
    projectName: project.projectName,
    projectId: project.projectId,
    description: project.description,
    inputFiles: project.inputFiles.map((f) => ({
      key: f.key,
      name: f.name,
      size: f.size,
      contentType: f.contentType,
    })),
  };
}

/**
 * Create presigned URL request body
 */
export function createPresignedUrlRequest(
  projectId: string,
  filename: string,
  contentType: string
): {
  projectId: string;
  filename: string;
  contentType: string;
} {
  return {
    projectId,
    filename,
    contentType,
  };
}

// ============================================
// Decision Log Entry Fixtures
// ============================================

export interface DecisionLogEntry {
  id?: string;
  project_id: string;
  session_id: string | null;
  entry_type: string;
  phase: number | null;
  iteration: number | null;
  agent_name: string | null;
  score: number | null;
  issues_count: number | null;
  content: string;
  metadata: Record<string, unknown>;
  created_at?: string;
}

/**
 * Create a decision log entry
 */
export function createDecisionLogEntry(
  projectId: string,
  entryType: string,
  overrides?: Partial<DecisionLogEntry>
): DecisionLogEntry {
  return {
    project_id: projectId,
    session_id: null,
    entry_type: entryType,
    phase: null,
    iteration: null,
    agent_name: null,
    score: null,
    issues_count: null,
    content: `Test ${entryType} entry`,
    metadata: {},
    ...overrides,
  };
}

/**
 * Create decision log entries for a complete workflow
 */
export function createCompleteDecisionLog(projectId: string): DecisionLogEntry[] {
  const sessionId = generateTestId('session');
  const entries: DecisionLogEntry[] = [];

  // Phase 0
  entries.push(createDecisionLogEntry(projectId, 'log_phase_start', {
    session_id: sessionId,
    phase: 0,
    content: 'Starting Phase 0: Scavenging',
  }));
  entries.push(createDecisionLogEntry(projectId, 'log_decision', {
    session_id: sessionId,
    phase: 0,
    agent_name: 'Scavenger',
    content: 'Detected PostgreSQL from architecture.md',
    metadata: { tech_id: 'tech_001', confidence: 0.95 },
  }));
  entries.push(createDecisionLogEntry(projectId, 'log_governance_batch', {
    session_id: sessionId,
    phase: 0,
    content: 'User approved 3 technologies',
    metadata: { approved_count: 3, skipped_count: 0 },
  }));
  entries.push(createDecisionLogEntry(projectId, 'log_phase_end', {
    session_id: sessionId,
    phase: 0,
    content: 'Completed Phase 0: Scavenging',
  }));

  // Phase 1 - Vision Loop
  entries.push(createDecisionLogEntry(projectId, 'log_phase_start', {
    session_id: sessionId,
    phase: 1,
    content: 'Starting Phase 1: Vision Loop',
  }));

  // Iteration 1
  entries.push(createDecisionLogEntry(projectId, 'log_iteration', {
    session_id: sessionId,
    phase: 1,
    iteration: 1,
    agent_name: 'Creator',
    content: 'Generated initial vision draft',
  }));
  entries.push(createDecisionLogEntry(projectId, 'log_iteration', {
    session_id: sessionId,
    phase: 1,
    iteration: 1,
    agent_name: 'Critic',
    score: 72,
    issues_count: 4,
    content: 'Vision lacks competitive analysis',
  }));
  entries.push(createDecisionLogEntry(projectId, 'log_iteration', {
    session_id: sessionId,
    phase: 1,
    iteration: 1,
    agent_name: 'Refiner',
    content: 'Improved vision with competitive analysis',
  }));

  // Iteration 2
  entries.push(createDecisionLogEntry(projectId, 'log_iteration', {
    session_id: sessionId,
    phase: 1,
    iteration: 2,
    agent_name: 'Critic',
    score: 91,
    issues_count: 0,
    content: 'Vision meets quality threshold',
  }));

  entries.push(createDecisionLogEntry(projectId, 'log_phase_end', {
    session_id: sessionId,
    phase: 1,
    content: 'Completed Phase 1: Vision Loop',
    metadata: { final_score: 91, iterations: 2 },
  }));

  // Phase 2 - Architecture Loop
  entries.push(createDecisionLogEntry(projectId, 'log_phase_start', {
    session_id: sessionId,
    phase: 2,
    content: 'Starting Phase 2: Architecture Loop',
  }));

  entries.push(createDecisionLogEntry(projectId, 'log_iteration', {
    session_id: sessionId,
    phase: 2,
    iteration: 1,
    agent_name: 'Architect',
    content: 'Generated initial architecture draft',
  }));
  entries.push(createDecisionLogEntry(projectId, 'log_iteration', {
    session_id: sessionId,
    phase: 2,
    iteration: 1,
    agent_name: 'Dr. Doom',
    score: 85,
    issues_count: 2,
    content: 'Architecture has scalability concerns',
    metadata: { risks: ['single point of failure', 'database bottleneck'] },
  }));
  entries.push(createDecisionLogEntry(projectId, 'log_iteration', {
    session_id: sessionId,
    phase: 2,
    iteration: 1,
    agent_name: 'Fixer',
    content: 'Researched mitigation strategies',
  }));
  entries.push(createDecisionLogEntry(projectId, 'log_iteration', {
    session_id: sessionId,
    phase: 2,
    iteration: 2,
    agent_name: 'Dr. Doom',
    score: 93,
    issues_count: 0,
    content: 'Architecture meets quality threshold',
  }));

  entries.push(createDecisionLogEntry(projectId, 'log_phase_end', {
    session_id: sessionId,
    phase: 2,
    content: 'Completed Phase 2: Architecture Loop',
    metadata: { final_score: 93, iterations: 2 },
  }));

  return entries;
}

// ============================================
// Document Content Fixtures
// ============================================

/**
 * Generate mock vision document content
 */
export function createVisionDocumentContent(
  projectName: string,
  version: number
): string {
  return `# Product Vision: ${projectName}

## Version ${version}

## Executive Summary

${projectName} is a comprehensive solution designed to address the core needs of modern enterprises.

## Problem Statement

Organizations face significant challenges in:
- Managing complex workflows
- Integrating multiple systems
- Ensuring data consistency

## Vision Statement

To become the leading platform for enterprise workflow automation.

## Target Users

1. **Enterprise IT Teams** - Primary users managing integrations
2. **Business Analysts** - Secondary users creating workflows
3. **Executives** - Stakeholders viewing dashboards

## Key Features

### Core Capabilities
- Automated workflow orchestration
- Real-time data synchronization
- Comprehensive audit trails

### Technical Requirements
- RESTful API architecture
- Event-driven processing
- Horizontal scalability

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| User Adoption | 1000+ | - |
| Workflow Completion Rate | 99.5% | - |
| System Uptime | 99.99% | - |

## Competitive Analysis

### Market Position
${projectName} differentiates through:
- Superior AI integration
- Enterprise-grade security
- Intuitive user experience

---
*Generated by AI Product Factory v${version}*
`;
}

/**
 * Generate mock architecture document content
 */
export function createArchitectureDocumentContent(
  projectName: string,
  version: number
): string {
  return `# Architecture Vision: ${projectName}

## Version ${version}

## System Context (C4 Level 1)

The system integrates with:
- External identity providers
- Cloud storage services
- Third-party APIs

## Container Diagram (C4 Level 2)

### Containers
1. **Web Application** - React SPA
2. **API Gateway** - Node.js/Express
3. **Worker Service** - Background processing
4. **Database** - PostgreSQL
5. **Cache** - Redis
6. **Message Queue** - Redis Pub/Sub

## Component Architecture (C4 Level 3)

### API Gateway Components
- Authentication Middleware
- Rate Limiting
- Request Validation
- Response Transformation

### Worker Service Components
- Job Queue Manager
- Task Executors
- Result Aggregator

## Technology Stack

| Layer | Technology | Justification |
|-------|------------|---------------|
| Frontend | React + TypeScript | Type safety, component reuse |
| API | Node.js + Express | High throughput, async I/O |
| Database | PostgreSQL | ACID compliance, JSON support |
| Cache | Redis | Low latency, pub/sub capability |

## Security Architecture

### Authentication
- OAuth 2.0 with PKCE
- JWT token validation
- Session management

### Data Protection
- TLS 1.3 in transit
- AES-256 at rest
- Field-level encryption

## Deployment Architecture

### Infrastructure
- Kubernetes orchestration
- Multi-region deployment
- Auto-scaling enabled

### CI/CD Pipeline
1. Code commit triggers build
2. Automated testing
3. Container image build
4. Staged deployment

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Database failure | Multi-AZ replication |
| Cache miss storms | Circuit breaker pattern |
| API overload | Rate limiting + CDN |

---
*Generated by AI Product Factory v${version}*
`;
}

/**
 * Generate mock decision log markdown content
 */
export function createDecisionLogContent(
  projectName: string,
  entries?: Array<{ type: string; content: string }>
): string {
  let entriesSection = '';
  if (entries && entries.length > 0) {
    entriesSection = '\n## Additional Entries\n\n' +
      entries.map(e => `### ${e.type}\n${e.content}\n`).join('\n');
  }

  return `# Decision Log: ${projectName}

## Phase 0: Scavenging

### TECH-001: PostgreSQL Database
- **Status**: Approved
- **Scope**: Global
- **Confidence**: 95%
- **Source**: architecture.md
- **Alternatives Considered**: MySQL, CockroachDB
- **Decision**: PostgreSQL selected for JSONB support and ecosystem maturity

### TECH-002: React Framework
- **Status**: Approved
- **Scope**: Global
- **Confidence**: 92%
- **Source**: frontend-standards.md
- **Alternatives Considered**: Vue.js, Svelte
- **Decision**: React selected for component library ecosystem

## Phase 1: Vision Loop

### Iteration 1
- **Agent**: Creator
- **Action**: Generated initial vision draft
- **Timestamp**: ${new Date().toISOString()}

### Iteration 1 - Critique
- **Agent**: Critic
- **Score**: 72/100
- **Issues**: 4
- **Feedback**: Vision lacks competitive analysis section

### Iteration 2
- **Agent**: Refiner
- **Action**: Added competitive analysis
- **Score Improvement**: +19 points

### Iteration 2 - Final
- **Agent**: Critic
- **Score**: 91/100
- **Status**: Threshold met (>=90)

## Phase 2: Architecture Loop

### Iteration 1
- **Agent**: Architect
- **Action**: Generated ARC42 architecture

### Iteration 1 - Risk Analysis
- **Agent**: Dr. Doom
- **Score**: 85/100
- **Risks Identified**:
  - Single point of failure in database
  - No caching strategy defined

### Iteration 1 - Mitigation
- **Agent**: Fixer
- **Action**: Researched mitigation strategies
- **Sources**: PostgreSQL HA docs, Redis caching patterns

### Iteration 2 - Final
- **Agent**: Dr. Doom
- **Score**: 93/100
- **Status**: Threshold met (>=90)
${entriesSection}
---
*Log generated by AI Product Factory*
`;
}
