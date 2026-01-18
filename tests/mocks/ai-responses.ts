/**
 * AI Response Fixtures for integration tests
 * Provides deterministic mock responses for LLM agents
 */

// ============================================
// Types
// ============================================

export interface VisionResponse {
  document: string;
  score: number;
  issues: string[];
}

export interface ArchitectureResponse {
  document: string;
  score: number;
  risks: Array<{
    risk: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string | null;
  }>;
}

export interface CritiqueResponse {
  score: number;
  issues: string[];
  strengths: string[];
  recommendations: string[];
}

export interface ScavengerResponse {
  techStack: Array<{
    id: string;
    name: string;
    category: string;
    type: string;
    confidence: number;
    source: string;
    alternatives: Array<{
      name: string;
      description: string;
    }>;
  }>;
}

// ============================================
// Scavenger (Phase 0) Responses
// ============================================

export const SCAVENGER_RESPONSES: Record<string, ScavengerResponse> = {
  default: {
    techStack: [
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
    ],
  },
  minimal: {
    techStack: [
      {
        id: 'tech_001',
        name: 'SQLite',
        category: 'database',
        type: 'technology',
        confidence: 0.88,
        source: 'requirements.md',
        alternatives: [],
      },
    ],
  },
  enterprise: {
    techStack: [
      {
        id: 'tech_001',
        name: 'Oracle Database',
        category: 'database',
        type: 'technology',
        confidence: 0.96,
        source: 'enterprise-requirements.pdf',
        alternatives: [
          { name: 'PostgreSQL', description: 'Open-source alternative' },
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
          { name: 'Node.js', description: 'JavaScript runtime' },
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
          { name: 'SAML', description: 'Enterprise SSO standard' },
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
        ],
      },
    ],
  },
};

// ============================================
// Vision (Phase 1) Responses
// ============================================

/**
 * Get vision response for a specific iteration
 * Scores improve with each iteration until threshold
 */
export function getVisionResponse(
  projectName: string,
  iteration: number
): VisionResponse {
  // Scores progress: 65 → 78 → 92
  const scoreProgression = [65, 78, 92, 95, 97];
  const score = scoreProgression[Math.min(iteration - 1, scoreProgression.length - 1)];

  const issuesByScore: Record<number, string[]> = {
    65: [
      'Missing competitive analysis',
      'User personas need more detail',
      'Success metrics are too vague',
      'Market size claims need sources',
    ],
    78: [
      'Could strengthen value proposition',
      'Consider additional user segments',
    ],
    92: [],
    95: [],
    97: [],
  };

  const issues = issuesByScore[score] || [];

  return {
    document: generateVisionDocument(projectName, iteration),
    score,
    issues,
  };
}

function generateVisionDocument(projectName: string, version: number): string {
  return `# Product Vision: ${projectName}

## Version ${version}.0

## Executive Summary

${projectName} is a comprehensive platform designed to transform how organizations manage their workflows and data integration needs. This vision document outlines our strategic direction and core value propositions.

## Problem Statement

Organizations face critical challenges:
- Fragmented systems leading to data silos
- Manual processes consuming valuable resources
- Lack of real-time visibility into operations
- Difficulty scaling as business grows

## Vision Statement

To be the leading platform enabling seamless workflow automation and data integration for modern enterprises.

## Target Users

### Primary Users
1. **IT Teams** - Responsible for system integrations
2. **Business Analysts** - Creating and managing workflows
3. **Operations Managers** - Monitoring and optimization

### Secondary Users
1. **Executives** - Dashboard and reporting
2. **External Partners** - API integrations

## Key Features

### Core Capabilities
- Automated workflow orchestration
- Real-time data synchronization
- Comprehensive audit trails
- Self-service configuration

### Technical Requirements
- RESTful API architecture
- Event-driven processing
- Horizontal scalability
- Multi-tenant support

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| User Adoption | 1000+ monthly active users | Analytics |
| Workflow Success Rate | 99.5% | Monitoring |
| System Uptime | 99.99% | SLA |
| User Satisfaction | NPS > 50 | Surveys |

## Competitive Analysis

${version >= 2 ? `
### Market Landscape
- Competitor A: Strong enterprise presence, lacks modern UX
- Competitor B: Developer-focused, limited no-code options
- Competitor C: SMB focused, scalability concerns

### Our Differentiation
- Superior AI-powered automation
- Best-in-class user experience
- Enterprise security with startup agility
` : '*(To be added in next iteration)*'}

## Timeline

- **Phase 1** (Q1): Core platform launch
- **Phase 2** (Q2): Advanced integrations
- **Phase 3** (Q3): AI features
- **Phase 4** (Q4): Enterprise expansion

---
*Document Version: ${version}.0*
*Generated by AI Product Factory*
`;
}

// ============================================
// Architecture (Phase 2) Responses
// ============================================

/**
 * Get architecture response for a specific iteration
 */
export function getArchitectureResponse(
  projectName: string,
  iteration: number
): ArchitectureResponse {
  // Scores progress: 70 → 85 → 93
  const scoreProgression = [70, 85, 93, 96, 98];
  const score = scoreProgression[Math.min(iteration - 1, scoreProgression.length - 1)];

  const risksByIteration: Array<ArchitectureResponse['risks']> = [
    // Iteration 1: Multiple risks
    [
      { risk: 'Single database instance creates SPOF', severity: 'high', mitigation: null },
      { risk: 'No caching strategy defined', severity: 'medium', mitigation: null },
      { risk: 'Missing disaster recovery plan', severity: 'high', mitigation: null },
    ],
    // Iteration 2: Some mitigated
    [
      { risk: 'Cache invalidation complexity', severity: 'low', mitigation: 'Event-driven invalidation' },
    ],
    // Iteration 3+: All mitigated
    [],
  ];

  const risks = risksByIteration[Math.min(iteration - 1, risksByIteration.length - 1)];

  return {
    document: generateArchitectureDocument(projectName, iteration),
    score,
    risks,
  };
}

function generateArchitectureDocument(projectName: string, version: number): string {
  return `# Architecture Vision: ${projectName}

## Version ${version}.0

## System Context (C4 Level 1)

### External Systems
- **Identity Provider** - Authentication via OAuth 2.0
- **Cloud Storage** - Document and artifact storage
- **Email Service** - Notifications
- **Analytics Platform** - Usage tracking

### System Boundaries
The ${projectName} platform handles:
- Workflow execution
- Data transformation
- User management
- Audit logging

## Container Diagram (C4 Level 2)

### Containers

| Container | Technology | Purpose |
|-----------|------------|---------|
| Web Application | React + TypeScript | User interface |
| API Gateway | Node.js + Express | Request routing |
| Worker Service | Node.js | Background processing |
| Database | PostgreSQL | Persistent storage |
| Cache | Redis | Session & data caching |
| Message Queue | Redis Pub/Sub | Async messaging |

## Component Architecture (C4 Level 3)

### API Gateway Components
- Authentication Middleware
- Rate Limiting
- Request Validation
- Response Caching
- Error Handling

### Worker Service Components
- Job Queue Manager
- Task Executors
- Result Aggregator
- Retry Handler

## Technology Decisions

### Database Choice: PostgreSQL
**Decision**: Use PostgreSQL as primary database
**Rationale**: ACID compliance, JSONB support, mature ecosystem
**Alternatives Considered**: MySQL, MongoDB

### Caching Strategy: Redis
**Decision**: Implement Redis for caching and pub/sub
**Rationale**: Low latency, data structures, scalability
${version >= 2 ? '**Implementation**: Cache-aside pattern with event-driven invalidation' : ''}

## Security Architecture

### Authentication & Authorization
- OAuth 2.0 with PKCE for SPAs
- JWT tokens (15-minute expiry)
- Role-based access control (RBAC)

### Data Protection
- TLS 1.3 for data in transit
- AES-256 encryption at rest
- Field-level encryption for PII

## Deployment Architecture

### Infrastructure
- Kubernetes orchestration
- Multi-AZ deployment
- Auto-scaling (2-10 pods)

${version >= 2 ? `
### High Availability
- Database: Multi-AZ replication with automatic failover
- Application: Multiple replicas behind load balancer
- Cache: Redis Cluster with sentinel
` : ''}

### CI/CD Pipeline
1. Code commit triggers pipeline
2. Automated testing (unit, integration)
3. Container build and scan
4. Staged deployment (dev → staging → production)

## Risk Mitigation

${version >= 2 ? `
| Risk | Severity | Mitigation |
|------|----------|------------|
| Database failure | High | Multi-AZ replication |
| Cache failure | Medium | Circuit breaker + fallback |
| Service overload | Medium | Rate limiting + auto-scale |
| Data breach | Critical | Encryption + audit logging |
` : '| Risk | Severity | Mitigation |\n|------|----------|------------|\n| *(To be detailed)* | - | - |'}

## Performance Requirements

- API Response Time: < 200ms (p95)
- Throughput: 1000 requests/second
- Database Query Time: < 50ms (p95)
- Worker Processing: < 30 seconds per task

---
*Document Version: ${version}.0*
*Generated by AI Product Factory*
`;
}

// ============================================
// Critique Responses
// ============================================

export function getCritiqueResponse(
  type: 'vision' | 'architecture',
  score: number
): CritiqueResponse {
  if (score < 70) {
    return {
      score,
      issues: [
        'Document lacks required depth',
        'Missing critical sections',
        'Unclear requirements',
        'No measurable success criteria',
      ],
      strengths: ['Basic structure is present'],
      recommendations: [
        'Add comprehensive analysis',
        'Include measurable metrics',
        'Address all stakeholder concerns',
        'Add competitive positioning',
      ],
    };
  }

  if (score < 85) {
    return {
      score,
      issues: [
        'Some sections need more detail',
        'Could strengthen specific areas',
      ],
      strengths: [
        'Good overall structure',
        'Clear value proposition',
        'Reasonable technical approach',
      ],
      recommendations: [
        'Expand on identified gaps',
        'Add more specific examples',
      ],
    };
  }

  return {
    score,
    issues: [],
    strengths: [
      'Comprehensive coverage',
      'Clear and actionable',
      'Well-structured document',
      'Addresses all key concerns',
    ],
    recommendations: [
      'Document is ready for approval',
    ],
  };
}

// ============================================
// Dr. Doom (Risk Analysis) Responses
// ============================================

export interface DrDoomResponse {
  overallRiskScore: number;
  risks: Array<{
    id: string;
    risk: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    probability: 'unlikely' | 'possible' | 'likely' | 'certain';
    impact: string;
    mitigation: string | null;
    category: string;
  }>;
  recommendations: string[];
}

export function getDrDoomResponse(iteration: number): DrDoomResponse {
  if (iteration === 1) {
    return {
      overallRiskScore: 35,
      risks: [
        {
          id: 'RISK-001',
          risk: 'Single point of failure in database layer',
          severity: 'high',
          probability: 'possible',
          impact: 'Complete system outage during database failure',
          mitigation: null,
          category: 'availability',
        },
        {
          id: 'RISK-002',
          risk: 'No defined caching strategy leads to database overload',
          severity: 'medium',
          probability: 'likely',
          impact: 'Degraded performance under load',
          mitigation: null,
          category: 'performance',
        },
        {
          id: 'RISK-003',
          risk: 'Missing disaster recovery plan',
          severity: 'high',
          probability: 'possible',
          impact: 'Extended downtime and potential data loss',
          mitigation: null,
          category: 'resilience',
        },
      ],
      recommendations: [
        'Implement database replication for high availability',
        'Add Redis caching layer with proper invalidation',
        'Document and test disaster recovery procedures',
      ],
    };
  }

  // After mitigation
  return {
    overallRiskScore: 85,
    risks: [
      {
        id: 'RISK-001',
        risk: 'Cache invalidation timing edge cases',
        severity: 'low',
        probability: 'unlikely',
        impact: 'Brief data staleness (< 1 second)',
        mitigation: 'Event-driven invalidation with TTL fallback',
        category: 'consistency',
      },
    ],
    recommendations: [
      'Architecture meets acceptable risk threshold',
      'Continue monitoring identified low-risk areas',
    ],
  };
}

// ============================================
// Fixer (Research) Responses
// ============================================

export interface FixerResponse {
  research: Array<{
    topic: string;
    findings: string[];
    sources: string[];
    recommendation: string;
  }>;
}

export function getFixerResponse(risks: string[]): FixerResponse {
  const researchByRisk: Record<string, FixerResponse['research'][0]> = {
    'database': {
      topic: 'Database High Availability',
      findings: [
        'PostgreSQL supports streaming replication',
        'Multi-AZ deployment prevents single point of failure',
        'Automatic failover achievable with Patroni or pgpool',
      ],
      sources: [
        'PostgreSQL Documentation',
        'AWS RDS Best Practices',
        'Patroni Project',
      ],
      recommendation: 'Implement PostgreSQL with streaming replication and automatic failover using Patroni',
    },
    'caching': {
      topic: 'Caching Strategy',
      findings: [
        'Cache-aside pattern is most flexible',
        'Redis Cluster provides horizontal scaling',
        'Event-driven invalidation prevents stale data',
      ],
      sources: [
        'Redis Documentation',
        'Microsoft Caching Patterns Guide',
      ],
      recommendation: 'Use Redis with cache-aside pattern and event-driven invalidation',
    },
    'disaster': {
      topic: 'Disaster Recovery',
      findings: [
        'RPO/RTO objectives guide strategy selection',
        'Cross-region replication for critical data',
        'Regular DR drills essential for readiness',
      ],
      sources: [
        'AWS Disaster Recovery Whitepaper',
        'Google Cloud DR Planning Guide',
      ],
      recommendation: 'Implement cross-region backup with documented recovery procedures',
    },
  };

  const research: FixerResponse['research'] = [];

  for (const risk of risks) {
    const lowerRisk = risk.toLowerCase();
    if (lowerRisk.includes('database') || lowerRisk.includes('spof')) {
      research.push(researchByRisk['database']);
    }
    if (lowerRisk.includes('cache') || lowerRisk.includes('caching')) {
      research.push(researchByRisk['caching']);
    }
    if (lowerRisk.includes('disaster') || lowerRisk.includes('recovery')) {
      research.push(researchByRisk['disaster']);
    }
  }

  // Default response if no specific risks matched
  if (research.length === 0) {
    research.push({
      topic: 'General Architecture Best Practices',
      findings: [
        'Follow 12-factor app principles',
        'Implement observability from the start',
        'Design for failure',
      ],
      sources: ['12-Factor App', 'Site Reliability Engineering Book'],
      recommendation: 'Apply industry best practices for resilient architecture',
    });
  }

  return { research };
}
