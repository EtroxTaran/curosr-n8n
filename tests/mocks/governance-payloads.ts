/**
 * Governance Payload Mocks for integration tests
 * Provides sample governance request/response payloads for testing
 */

import type { TechItem, GovernancePayload, GovernanceResponse, GovernanceDecision } from '../helpers/test-fixtures';

// ============================================
// Sample Tech Stacks for Different Scenarios
// ============================================

/**
 * Standard web application tech stack
 */
export const WEB_APP_TECH_STACK: TechItem[] = [
  {
    id: 'tech_001',
    name: 'PostgreSQL',
    category: 'database',
    type: 'technology',
    confidence: 0.95,
    source: 'architecture.md',
    alternatives: [
      { name: 'MySQL', description: 'Popular open-source RDBMS' },
      { name: 'CockroachDB', description: 'Distributed SQL database' },
    ],
  },
  {
    id: 'tech_002',
    name: 'React',
    category: 'framework',
    type: 'technology',
    confidence: 0.92,
    source: 'frontend-standards.md',
    alternatives: [
      { name: 'Vue.js', description: 'Progressive JavaScript framework' },
      { name: 'Svelte', description: 'Compiler-based framework' },
    ],
  },
  {
    id: 'tech_003',
    name: 'TypeScript',
    category: 'language',
    type: 'technology',
    confidence: 0.98,
    source: 'coding-standards.md',
    alternatives: [
      { name: 'JavaScript', description: 'Dynamic scripting language' },
    ],
  },
  {
    id: 'tech_004',
    name: 'Node.js',
    category: 'runtime',
    type: 'technology',
    confidence: 0.90,
    source: 'architecture.md',
    alternatives: [
      { name: 'Deno', description: 'Secure runtime for JavaScript' },
      { name: 'Bun', description: 'Fast JavaScript runtime' },
    ],
  },
];

/**
 * Enterprise tech stack with security requirements
 */
export const ENTERPRISE_TECH_STACK: TechItem[] = [
  {
    id: 'tech_001',
    name: 'Oracle Database',
    category: 'database',
    type: 'technology',
    confidence: 0.96,
    source: 'enterprise-requirements.pdf',
    alternatives: [
      { name: 'PostgreSQL', description: 'Open-source alternative' },
      { name: 'SQL Server', description: 'Microsoft enterprise database' },
    ],
  },
  {
    id: 'tech_002',
    name: 'Java Spring',
    category: 'framework',
    type: 'technology',
    confidence: 0.94,
    source: 'architecture.md',
    alternatives: [
      { name: 'Quarkus', description: 'Cloud-native Java framework' },
      { name: '.NET Core', description: 'Microsoft cross-platform framework' },
    ],
  },
  {
    id: 'tech_003',
    name: 'OAuth 2.0',
    category: 'security',
    type: 'standard',
    confidence: 0.99,
    source: 'security-requirements.md',
    alternatives: [
      { name: 'SAML 2.0', description: 'Enterprise SSO standard' },
    ],
  },
  {
    id: 'tech_004',
    name: 'Kubernetes',
    category: 'infrastructure',
    type: 'technology',
    confidence: 0.91,
    source: 'deployment.md',
    alternatives: [
      { name: 'Docker Swarm', description: 'Simpler orchestration' },
      { name: 'Nomad', description: 'HashiCorp orchestrator' },
    ],
  },
  {
    id: 'tech_005',
    name: 'Vault',
    category: 'security',
    type: 'technology',
    confidence: 0.88,
    source: 'security-requirements.md',
    alternatives: [
      { name: 'AWS Secrets Manager', description: 'Cloud-native secrets' },
    ],
  },
];

/**
 * Minimal tech stack for simple projects
 */
export const MINIMAL_TECH_STACK: TechItem[] = [
  {
    id: 'tech_001',
    name: 'SQLite',
    category: 'database',
    type: 'technology',
    confidence: 0.88,
    source: 'requirements.md',
    alternatives: [],
  },
];

/**
 * AI/ML focused tech stack
 */
export const AI_ML_TECH_STACK: TechItem[] = [
  {
    id: 'tech_001',
    name: 'Python',
    category: 'language',
    type: 'technology',
    confidence: 0.97,
    source: 'ml-requirements.md',
    alternatives: [
      { name: 'Julia', description: 'High-performance scientific computing' },
    ],
  },
  {
    id: 'tech_002',
    name: 'PyTorch',
    category: 'framework',
    type: 'technology',
    confidence: 0.93,
    source: 'ml-requirements.md',
    alternatives: [
      { name: 'TensorFlow', description: 'Google ML framework' },
      { name: 'JAX', description: 'High-performance ML library' },
    ],
  },
  {
    id: 'tech_003',
    name: 'PostgreSQL with pgvector',
    category: 'database',
    type: 'technology',
    confidence: 0.89,
    source: 'architecture.md',
    alternatives: [
      { name: 'Pinecone', description: 'Managed vector database' },
      { name: 'Qdrant', description: 'Open-source vector search' },
    ],
  },
  {
    id: 'tech_004',
    name: 'FastAPI',
    category: 'framework',
    type: 'technology',
    confidence: 0.91,
    source: 'api-standards.md',
    alternatives: [
      { name: 'Flask', description: 'Lightweight Python framework' },
    ],
  },
];

// ============================================
// Governance Payload Generators
// ============================================

/**
 * Create a governance payload for a web application project
 */
export function createWebAppGovernancePayload(projectId: string): GovernancePayload {
  return {
    type: 'governance_request',
    scavenging_id: `sc_${Date.now()}_webapp`,
    project_id: projectId,
    detected_stack: WEB_APP_TECH_STACK,
    webhook_url: 'http://localhost:5679/webhook/governance-batch',
  };
}

/**
 * Create a governance payload for an enterprise project
 */
export function createEnterpriseGovernancePayload(projectId: string): GovernancePayload {
  return {
    type: 'governance_request',
    scavenging_id: `sc_${Date.now()}_enterprise`,
    project_id: projectId,
    detected_stack: ENTERPRISE_TECH_STACK,
    webhook_url: 'http://localhost:5679/webhook/governance-batch',
  };
}

/**
 * Create a governance payload for a minimal project
 */
export function createMinimalGovernancePayload(projectId: string): GovernancePayload {
  return {
    type: 'governance_request',
    scavenging_id: `sc_${Date.now()}_minimal`,
    project_id: projectId,
    detected_stack: MINIMAL_TECH_STACK,
    webhook_url: 'http://localhost:5679/webhook/governance-batch',
  };
}

/**
 * Create a governance payload for an AI/ML project
 */
export function createAiMlGovernancePayload(projectId: string): GovernancePayload {
  return {
    type: 'governance_request',
    scavenging_id: `sc_${Date.now()}_aiml`,
    project_id: projectId,
    detected_stack: AI_ML_TECH_STACK,
    webhook_url: 'http://localhost:5679/webhook/governance-batch',
  };
}

// ============================================
// Governance Response Generators
// ============================================

/**
 * Create an approve-all response for a governance payload
 */
export function createApproveAllGovernanceResponse(
  payload: GovernancePayload,
  scope: 'global' | 'local' = 'global'
): GovernanceResponse {
  const decisions: GovernanceDecision[] = payload.detected_stack.map((tech) => ({
    tech_id: tech.id,
    action: 'approve' as const,
    selected_name: tech.name,
    scope,
  }));

  return {
    scavenging_id: payload.scavenging_id,
    project_id: payload.project_id,
    decisions,
  };
}

/**
 * Create a skip-all response for a governance payload
 */
export function createSkipAllGovernanceResponse(
  payload: GovernancePayload
): GovernanceResponse {
  const decisions: GovernanceDecision[] = payload.detected_stack.map((tech) => ({
    tech_id: tech.id,
    action: 'skip' as const,
    selected_name: tech.name,
    scope: 'local',
  }));

  return {
    scavenging_id: payload.scavenging_id,
    project_id: payload.project_id,
    decisions,
  };
}

/**
 * Create a mixed decisions response (approve some, skip some, use alternatives)
 */
export function createMixedGovernanceResponse(
  payload: GovernancePayload
): GovernanceResponse {
  const decisions: GovernanceDecision[] = payload.detected_stack.map((tech, index) => {
    // Alternate between approve, skip, and alternative
    if (index % 3 === 0) {
      return {
        tech_id: tech.id,
        action: 'approve' as const,
        selected_name: tech.name,
        scope: 'global' as const,
      };
    } else if (index % 3 === 1) {
      return {
        tech_id: tech.id,
        action: 'skip' as const,
        selected_name: tech.name,
        scope: 'local' as const,
      };
    } else {
      // Use first alternative if available
      const altName = tech.alternatives[0]?.name || tech.name;
      return {
        tech_id: tech.id,
        action: 'approve' as const,
        selected_name: altName,
        scope: 'local' as const,
      };
    }
  });

  return {
    scavenging_id: payload.scavenging_id,
    project_id: payload.project_id,
    decisions,
  };
}

/**
 * Create a response with all alternatives selected
 */
export function createAlternativesGovernanceResponse(
  payload: GovernancePayload,
  scope: 'global' | 'local' = 'local'
): GovernanceResponse {
  const decisions: GovernanceDecision[] = payload.detected_stack.map((tech) => {
    // Select first alternative if available, otherwise use original
    const selectedName = tech.alternatives[0]?.name || tech.name;
    return {
      tech_id: tech.id,
      action: 'approve' as const,
      selected_name: selectedName,
      scope,
    };
  });

  return {
    scavenging_id: payload.scavenging_id,
    project_id: payload.project_id,
    decisions,
  };
}

// ============================================
// Webhook Payload Expectations
// ============================================

/**
 * Expected payload format for /api/governance endpoint
 */
export interface GovernanceApiPayload {
  scavenging_id: string;
  project_id: string;
  decisions: GovernanceDecision[];
}

/**
 * Expected response format from /api/governance endpoint
 */
export interface GovernanceApiResponse {
  success: boolean;
  message: string;
  project_id: string;
  decisions_count: number;
  global_count: number;
  local_count: number;
}

/**
 * Expected payload sent to n8n webhook after governance
 */
export interface GovernanceBatchWebhookPayload {
  project_id: string;
  scavenging_id: string;
  approved_global: Array<{
    name: string;
    category: string;
    type: string;
    confidence: number;
    source: string;
  }>;
  approved_local: Array<{
    name: string;
    category: string;
    type: string;
    confidence: number;
    source: string;
  }>;
  skipped: string[];
  timestamp: string;
}

/**
 * Create expected webhook payload from governance response
 */
export function createExpectedWebhookPayload(
  payload: GovernancePayload,
  response: GovernanceResponse
): GovernanceBatchWebhookPayload {
  const approved_global: GovernanceBatchWebhookPayload['approved_global'] = [];
  const approved_local: GovernanceBatchWebhookPayload['approved_local'] = [];
  const skipped: string[] = [];

  for (const decision of response.decisions) {
    const tech = payload.detected_stack.find((t) => t.id === decision.tech_id);
    if (!tech) continue;

    if (decision.action === 'skip') {
      skipped.push(tech.name);
    } else if (decision.scope === 'global') {
      approved_global.push({
        name: decision.selected_name,
        category: tech.category,
        type: tech.type,
        confidence: tech.confidence,
        source: tech.source,
      });
    } else {
      approved_local.push({
        name: decision.selected_name,
        category: tech.category,
        type: tech.type,
        confidence: tech.confidence,
        source: tech.source,
      });
    }
  }

  return {
    project_id: payload.project_id,
    scavenging_id: payload.scavenging_id,
    approved_global,
    approved_local,
    skipped,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate governance response structure
 */
export function validateGovernanceResponse(response: unknown): response is GovernanceResponse {
  if (!response || typeof response !== 'object') return false;

  const r = response as Record<string, unknown>;

  if (typeof r.scavenging_id !== 'string') return false;
  if (typeof r.project_id !== 'string') return false;
  if (!Array.isArray(r.decisions)) return false;

  for (const decision of r.decisions) {
    if (!decision || typeof decision !== 'object') return false;
    const d = decision as Record<string, unknown>;
    if (typeof d.tech_id !== 'string') return false;
    if (d.action !== 'approve' && d.action !== 'skip') return false;
    if (typeof d.selected_name !== 'string') return false;
    if (d.scope !== 'global' && d.scope !== 'local') return false;
  }

  return true;
}

/**
 * Check if all technologies were approved
 */
export function allTechnologiesApproved(response: GovernanceResponse): boolean {
  return response.decisions.every((d) => d.action === 'approve');
}

/**
 * Count decisions by action type
 */
export function countDecisionsByAction(response: GovernanceResponse): {
  approved: number;
  skipped: number;
} {
  let approved = 0;
  let skipped = 0;

  for (const decision of response.decisions) {
    if (decision.action === 'approve') {
      approved++;
    } else {
      skipped++;
    }
  }

  return { approved, skipped };
}

/**
 * Count decisions by scope
 */
export function countDecisionsByScope(response: GovernanceResponse): {
  global: number;
  local: number;
} {
  let global = 0;
  let local = 0;

  for (const decision of response.decisions) {
    if (decision.action === 'approve') {
      if (decision.scope === 'global') {
        global++;
      } else {
        local++;
      }
    }
  }

  return { global, local };
}
