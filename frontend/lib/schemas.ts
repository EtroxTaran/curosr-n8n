import { z } from "zod";

// ============================================
// Input File Schemas
// ============================================

/**
 * Input file metadata stored in S3 and PostgreSQL
 */
export const InputFileSchema = z.object({
  key: z.string().describe("S3 key path for the file"),
  name: z.string().describe("Original filename"),
  size: z.number().int().nonnegative().describe("File size in bytes"),
  contentType: z.string().describe("MIME type of the file"),
  uploadedAt: z.string().datetime().describe("ISO timestamp of upload"),
});

export type InputFile = z.infer<typeof InputFileSchema>;

// ============================================
// Tech Governance Schemas
// ============================================

/**
 * Alternative technology suggested by Perplexity
 */
export const TechAlternativeSchema = z.object({
  name: z.string().describe("Name of the alternative technology"),
  description: z.string().describe("Brief description of the technology"),
  pros: z.array(z.string()).optional().describe("Advantages of this alternative"),
  cons: z.array(z.string()).optional().describe("Disadvantages of this alternative"),
});

export type TechAlternative = z.infer<typeof TechAlternativeSchema>;

/**
 * Technology category enum
 */
export const TechCategorySchema = z.enum([
  "database",
  "framework",
  "language",
  "security",
  "infrastructure",
  "integration",
  "compliance",
  "development",
]);

export type TechCategory = z.infer<typeof TechCategorySchema>;

/**
 * Technology type enum
 */
export const TechTypeSchema = z.enum([
  "technology",
  "pattern",
  "standard",
  "requirement",
  "constraint",
]);

export type TechType = z.infer<typeof TechTypeSchema>;

/**
 * Single tech item detected by Scavenger agent
 */
export const TechItemSchema = z.object({
  id: z.string().describe("Unique identifier for this tech item"),
  name: z.string().describe("Name of the technology/pattern"),
  type: TechTypeSchema,
  category: TechCategorySchema,
  description: z.string().describe("Detailed description"),
  source: z.string().describe("Document where this was found"),
  confidence: z.number().min(0).max(1).describe("Extraction confidence (0-1)"),
  alternatives: z.array(TechAlternativeSchema).optional().describe("Perplexity alternatives"),
});

export type TechItem = z.infer<typeof TechItemSchema>;

/**
 * Governance request payload sent from n8n to frontend
 */
export const GovernancePayloadSchema = z.object({
  type: z.literal("governance_request"),
  scavenging_id: z.string().describe("Unique scavenging session ID"),
  project_id: z.string().describe("Project identifier"),
  detected_stack: z.array(TechItemSchema).describe("All detected technologies"),
  webhook_url: z.string().url().describe("n8n webhook to POST response to"),
});

export type GovernancePayload = z.infer<typeof GovernancePayloadSchema>;

/**
 * User's decision for a single technology
 */
export const TechDecisionSchema = z.object({
  tech_id: z.string().describe("ID of the tech item this decision is for"),
  action: z.enum(["approve", "reject", "skip"]).describe("User's decision"),
  scope: z.enum(["global", "local"]).optional().describe("Scope if approved"),
  selected_alternative: z.string().optional().describe("Name of selected alternative (if any)"),
  notes: z.string().optional().describe("Optional user notes"),
});

export type TechDecision = z.infer<typeof TechDecisionSchema>;

/**
 * Batch governance response from frontend to n8n
 */
export const GovernanceResponseSchema = z.object({
  scavenging_id: z.string(),
  project_id: z.string(),
  decisions: z.array(TechDecisionSchema),
  submitted_at: z.string().datetime(),
});

export type GovernanceResponse = z.infer<typeof GovernanceResponseSchema>;

// ============================================
// Chat Message Schemas
// ============================================

/**
 * Chat message types for generative UI
 */
export const ChatMessageTypeSchema = z.enum([
  "text",
  "governance_request",
  "phase_update",
  "file_upload_request",
]);

export type ChatMessageType = z.infer<typeof ChatMessageTypeSchema>;

/**
 * Extended chat message with payload support
 */
export const ExtendedChatMessageSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  session_id: z.string().nullable(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  message_type: ChatMessageTypeSchema.optional().default("text"),
  payload: z.unknown().optional().describe("Rich payload for non-text messages"),
  n8n_execution_id: z.string().nullable().optional(),
  response_time_ms: z.number().nullable().optional(),
  created_at: z.string(),
});

export type ExtendedChatMessage = z.infer<typeof ExtendedChatMessageSchema>;

// ============================================
// Project State Schema (S3-based)
// ============================================

/**
 * Tech standard as stored in PostgreSQL
 */
export const TechStandardSchema = z.object({
  name: z.string(),
  category: z.string(),
  source: z.string(),
  confidence: z.number(),
  scope: z.enum(["global", "local"]),
});

export type TechStandard = z.infer<typeof TechStandardSchema>;

/**
 * Phase status enum
 */
export const PhaseStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "paused",
]);

export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

/**
 * Full project state for S3 persistence
 */
export const ProjectStateSchema = z.object({
  project_id: z.string(),
  project_name: z.string(),
  session_id: z.string().nullable(),
  current_phase: z.number().int().min(0).max(3),
  phase_status: PhaseStatusSchema,
  input_files: z.array(InputFileSchema),
  tech_standards_global: z.array(TechStandardSchema),
  tech_standards_local: z.array(TechStandardSchema),
  artifact_vision_draft: z.string().nullable().optional(),
  artifact_vision_final: z.string().nullable().optional(),
  artifact_architecture_draft: z.string().nullable().optional(),
  artifact_architecture_final: z.string().nullable().optional(),
  artifact_decision_log: z.string().nullable().optional(),
  total_iterations: z.number().int().default(0),
  total_duration_ms: z.number().int().default(0),
  config: z.record(z.unknown()).default({}),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type ProjectState = z.infer<typeof ProjectStateSchema>;

// ============================================
// API Request/Response Schemas
// ============================================

/**
 * Presigned URL request
 */
export const PresignedUrlRequestSchema = z.object({
  projectId: z.string(),
  filename: z.string(),
  contentType: z.string(),
});

export type PresignedUrlRequest = z.infer<typeof PresignedUrlRequestSchema>;

/**
 * Presigned URL response
 */
export const PresignedUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string(),
  expiresIn: z.number().int(),
});

export type PresignedUrlResponse = z.infer<typeof PresignedUrlResponseSchema>;
