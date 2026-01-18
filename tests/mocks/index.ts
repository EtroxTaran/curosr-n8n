/**
 * Test mocks index - re-exports all mock modules
 */

// Mock n8n server
export {
  MockN8nServer,
  type WebhookHandler,
  type WebhookCall,
} from './mock-n8n-server';

// AI response fixtures
export {
  type VisionResponse,
  type ArchitectureResponse,
  type CritiqueResponse,
  type ScavengerResponse,
  type DrDoomResponse,
  type FixerResponse,
  SCAVENGER_RESPONSES,
  getVisionResponse,
  getArchitectureResponse,
  getCritiqueResponse,
  getDrDoomResponse,
  getFixerResponse,
} from './ai-responses';

// Governance payload mocks
export {
  WEB_APP_TECH_STACK,
  ENTERPRISE_TECH_STACK,
  MINIMAL_TECH_STACK,
  AI_ML_TECH_STACK,
  createWebAppGovernancePayload,
  createEnterpriseGovernancePayload,
  createMinimalGovernancePayload,
  createAiMlGovernancePayload,
  createApproveAllGovernanceResponse,
  createSkipAllGovernanceResponse,
  createMixedGovernanceResponse,
  createAlternativesGovernanceResponse,
  createExpectedWebhookPayload,
  validateGovernanceResponse,
  allTechnologiesApproved,
  countDecisionsByAction,
  countDecisionsByScope,
  type GovernanceApiPayload,
  type GovernanceApiResponse,
  type GovernanceBatchWebhookPayload,
} from './governance-payloads';
