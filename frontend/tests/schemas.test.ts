import { describe, it, expect } from 'vitest';
import {
  InputFileSchema,
  TechAlternativeSchema,
  TechCategorySchema,
  TechTypeSchema,
  TechItemSchema,
  GovernancePayloadSchema,
  TechDecisionSchema,
  GovernanceResponseSchema,
  ChatMessageTypeSchema,
  ExtendedChatMessageSchema,
  TechStandardSchema,
  PhaseStatusSchema,
  ProjectStateSchema,
  PresignedUrlRequestSchema,
  PresignedUrlResponseSchema,
} from '@/lib/schemas';

// ============================================
// InputFileSchema Tests
// ============================================

describe('InputFileSchema', () => {
  const validFile = {
    key: 'projects/test-123/input/document.pdf',
    name: 'document.pdf',
    size: 1024,
    contentType: 'application/pdf',
    uploadedAt: '2026-01-15T10:00:00.000Z',
  };

  it('should accept valid input file', () => {
    const result = InputFileSchema.safeParse(validFile);
    expect(result.success).toBe(true);
  });

  it('should reject missing key', () => {
    const { key, ...invalid } = validFile;
    const result = InputFileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject missing name', () => {
    const { name, ...invalid } = validFile;
    const result = InputFileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject negative file size', () => {
    const invalid = { ...validFile, size: -100 };
    const result = InputFileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept zero file size', () => {
    const result = InputFileSchema.safeParse({ ...validFile, size: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject non-integer file size', () => {
    const invalid = { ...validFile, size: 1024.5 };
    const result = InputFileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject invalid datetime format', () => {
    const invalid = { ...validFile, uploadedAt: 'not-a-date' };
    const result = InputFileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept various valid datetime formats', () => {
    const dates = [
      '2026-01-15T10:00:00.000Z',
      '2026-01-15T10:00:00Z',
      '2026-12-31T23:59:59.999Z',
    ];
    for (const date of dates) {
      const result = InputFileSchema.safeParse({ ...validFile, uploadedAt: date });
      expect(result.success).toBe(true);
    }
  });
});

// ============================================
// TechAlternativeSchema Tests
// ============================================

describe('TechAlternativeSchema', () => {
  const validAlternative = {
    name: 'PostgreSQL',
    description: 'Open-source relational database',
  };

  it('should accept valid alternative with required fields only', () => {
    const result = TechAlternativeSchema.safeParse(validAlternative);
    expect(result.success).toBe(true);
  });

  it('should accept alternative with pros and cons', () => {
    const withProsAndCons = {
      ...validAlternative,
      pros: ['Open source', 'Well documented'],
      cons: ['Complex setup', 'Learning curve'],
    };
    const result = TechAlternativeSchema.safeParse(withProsAndCons);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pros).toEqual(['Open source', 'Well documented']);
      expect(result.data.cons).toEqual(['Complex setup', 'Learning curve']);
    }
  });

  it('should accept empty pros and cons arrays', () => {
    const withEmpty = { ...validAlternative, pros: [], cons: [] };
    const result = TechAlternativeSchema.safeParse(withEmpty);
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const { name, ...invalid } = validAlternative;
    const result = TechAlternativeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject missing description', () => {
    const { description, ...invalid } = validAlternative;
    const result = TechAlternativeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ============================================
// TechCategorySchema Tests
// ============================================

describe('TechCategorySchema', () => {
  const validCategories = [
    'database',
    'framework',
    'language',
    'security',
    'infrastructure',
    'integration',
    'compliance',
    'development',
  ];

  it('should accept all valid categories', () => {
    for (const category of validCategories) {
      const result = TechCategorySchema.safeParse(category);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid category', () => {
    const result = TechCategorySchema.safeParse('invalid_category');
    expect(result.success).toBe(false);
  });

  it('should reject empty string', () => {
    const result = TechCategorySchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('should be case-sensitive', () => {
    const result = TechCategorySchema.safeParse('DATABASE');
    expect(result.success).toBe(false);
  });
});

// ============================================
// TechTypeSchema Tests
// ============================================

describe('TechTypeSchema', () => {
  const validTypes = ['technology', 'pattern', 'standard', 'requirement', 'constraint'];

  it('should accept all valid types', () => {
    for (const type of validTypes) {
      const result = TechTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid type', () => {
    const result = TechTypeSchema.safeParse('unknown');
    expect(result.success).toBe(false);
  });
});

// ============================================
// TechItemSchema Tests
// ============================================

describe('TechItemSchema', () => {
  const validTechItem = {
    id: 'tech_001',
    name: 'React',
    type: 'technology',  // Valid type from TechTypeSchema
    category: 'framework',
    description: 'A JavaScript library for building user interfaces',
    source: 'tech-standards.md',
    confidence: 0.95,
  };

  it('should accept valid tech item', () => {
    const result = TechItemSchema.safeParse(validTechItem);
    expect(result.success).toBe(true);
  });

  it('should accept tech item with alternatives', () => {
    const withAlternatives = {
      ...validTechItem,
      alternatives: [
        { name: 'Vue.js', description: 'Progressive JavaScript framework' },
        { name: 'Angular', description: 'Platform for web applications' },
      ],
    };
    const result = TechItemSchema.safeParse(withAlternatives);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alternatives).toHaveLength(2);
    }
  });

  it('should reject confidence below 0', () => {
    const invalid = { ...validTechItem, confidence: -0.1 };
    const result = TechItemSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject confidence above 1', () => {
    const invalid = { ...validTechItem, confidence: 1.1 };
    const result = TechItemSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept boundary confidence values', () => {
    const result0 = TechItemSchema.safeParse({ ...validTechItem, confidence: 0 });
    const result1 = TechItemSchema.safeParse({ ...validTechItem, confidence: 1 });
    expect(result0.success).toBe(true);
    expect(result1.success).toBe(true);
  });

  it('should reject invalid type enum', () => {
    const invalid = { ...validTechItem, type: 'invalid' };
    const result = TechItemSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject invalid category enum', () => {
    const invalid = { ...validTechItem, category: 'invalid' };
    const result = TechItemSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ============================================
// GovernancePayloadSchema Tests
// ============================================

describe('GovernancePayloadSchema', () => {
  const validPayload = {
    type: 'governance_request' as const,
    scavenging_id: 'sc_abc123',
    project_id: 'proj_001',
    detected_stack: [
      {
        id: 'tech_001',
        name: 'PostgreSQL',
        type: 'technology',
        category: 'database',
        description: 'Relational database',
        source: 'architecture.md',
        confidence: 0.92,
      },
    ],
    webhook_url: 'https://n8n.example.com/webhook/governance-batch',
  };

  it('should accept valid governance payload', () => {
    const result = GovernancePayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('should accept empty detected_stack', () => {
    const empty = { ...validPayload, detected_stack: [] };
    const result = GovernancePayloadSchema.safeParse(empty);
    expect(result.success).toBe(true);
  });

  it('should reject invalid type literal', () => {
    const invalid = { ...validPayload, type: 'other_request' };
    const result = GovernancePayloadSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject invalid webhook URL', () => {
    const invalid = { ...validPayload, webhook_url: 'not-a-url' };
    const result = GovernancePayloadSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject missing scavenging_id', () => {
    const { scavenging_id, ...invalid } = validPayload;
    const result = GovernancePayloadSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept multiple tech items in detected_stack', () => {
    const multipleItems = {
      ...validPayload,
      detected_stack: [
        { id: 't1', name: 'React', type: 'technology', category: 'framework', description: 'd1', source: 's1', confidence: 0.9 },
        { id: 't2', name: 'Node.js', type: 'technology', category: 'language', description: 'd2', source: 's2', confidence: 0.8 },
        { id: 't3', name: 'Docker', type: 'technology', category: 'infrastructure', description: 'd3', source: 's3', confidence: 0.85 },
      ],
    };
    const result = GovernancePayloadSchema.safeParse(multipleItems);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.detected_stack).toHaveLength(3);
    }
  });
});

// ============================================
// TechDecisionSchema Tests
// ============================================

describe('TechDecisionSchema', () => {
  it('should accept approve with global scope', () => {
    const decision = { tech_id: 't1', action: 'approve', scope: 'global' };
    const result = TechDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  it('should accept approve with local scope', () => {
    const decision = { tech_id: 't1', action: 'approve', scope: 'local' };
    const result = TechDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  it('should accept skip without scope', () => {
    const decision = { tech_id: 't1', action: 'skip' };
    const result = TechDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  it('should accept reject action', () => {
    const decision = { tech_id: 't1', action: 'reject' };
    const result = TechDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  it('should accept decision with selected alternative', () => {
    const decision = {
      tech_id: 't1',
      action: 'approve',
      scope: 'global',
      selected_alternative: 'PostgreSQL',
    };
    const result = TechDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected_alternative).toBe('PostgreSQL');
    }
  });

  it('should accept decision with notes', () => {
    const decision = {
      tech_id: 't1',
      action: 'approve',
      scope: 'local',
      notes: 'Using for legacy system compatibility',
    };
    const result = TechDecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  it('should reject invalid action', () => {
    const decision = { tech_id: 't1', action: 'invalid' };
    const result = TechDecisionSchema.safeParse(decision);
    expect(result.success).toBe(false);
  });

  it('should reject invalid scope', () => {
    const decision = { tech_id: 't1', action: 'approve', scope: 'invalid' };
    const result = TechDecisionSchema.safeParse(decision);
    expect(result.success).toBe(false);
  });
});

// ============================================
// GovernanceResponseSchema Tests
// ============================================

describe('GovernanceResponseSchema', () => {
  const validResponse = {
    scavenging_id: 'sc_abc123',
    project_id: 'proj_001',
    decisions: [
      { tech_id: 't1', action: 'approve', scope: 'global' },
      { tech_id: 't2', action: 'skip' },
    ],
    submitted_at: '2026-01-15T12:00:00.000Z',
  };

  it('should accept valid response', () => {
    const result = GovernanceResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('should accept empty decisions array', () => {
    const empty = { ...validResponse, decisions: [] };
    const result = GovernanceResponseSchema.safeParse(empty);
    expect(result.success).toBe(true);
  });

  it('should reject missing submitted_at', () => {
    const { submitted_at, ...invalid } = validResponse;
    const result = GovernanceResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject invalid submitted_at format', () => {
    const invalid = { ...validResponse, submitted_at: 'invalid-date' };
    const result = GovernanceResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should validate nested decisions', () => {
    const invalidDecisions = {
      ...validResponse,
      decisions: [{ tech_id: 't1', action: 'invalid_action' }],
    };
    const result = GovernanceResponseSchema.safeParse(invalidDecisions);
    expect(result.success).toBe(false);
  });
});

// ============================================
// ChatMessageTypeSchema Tests
// ============================================

describe('ChatMessageTypeSchema', () => {
  const validTypes = ['text', 'governance_request', 'phase_update', 'file_upload_request'];

  it('should accept all valid message types', () => {
    for (const type of validTypes) {
      const result = ChatMessageTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid message type', () => {
    const result = ChatMessageTypeSchema.safeParse('unknown_type');
    expect(result.success).toBe(false);
  });
});

// ============================================
// ExtendedChatMessageSchema Tests
// ============================================

describe('ExtendedChatMessageSchema', () => {
  const validMessage = {
    id: 'msg_001',
    project_id: 'proj_001',
    session_id: 'sess_abc',
    role: 'assistant',
    content: 'Hello, how can I help?',
    created_at: '2026-01-15T10:00:00.000Z',
  };

  it('should accept valid message with required fields', () => {
    const result = ExtendedChatMessageSchema.safeParse(validMessage);
    expect(result.success).toBe(true);
    if (result.success) {
      // message_type is optional, undefined when not provided
      expect(result.data.message_type).toBeUndefined();
    }
  });

  it('should accept null session_id', () => {
    const result = ExtendedChatMessageSchema.safeParse({ ...validMessage, session_id: null });
    expect(result.success).toBe(true);
  });

  it('should accept governance_request message type with payload', () => {
    const governance = {
      ...validMessage,
      message_type: 'governance_request',
      payload: { type: 'governance_request', detected_stack: [] },
    };
    const result = ExtendedChatMessageSchema.safeParse(governance);
    expect(result.success).toBe(true);
  });

  it('should accept optional n8n_execution_id', () => {
    const result = ExtendedChatMessageSchema.safeParse({
      ...validMessage,
      n8n_execution_id: 'exec_123',
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional response_time_ms', () => {
    const result = ExtendedChatMessageSchema.safeParse({
      ...validMessage,
      response_time_ms: 1500,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid role', () => {
    const result = ExtendedChatMessageSchema.safeParse({ ...validMessage, role: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('should accept all valid roles', () => {
    const roles = ['user', 'assistant', 'system'];
    for (const role of roles) {
      const result = ExtendedChatMessageSchema.safeParse({ ...validMessage, role });
      expect(result.success).toBe(true);
    }
  });
});

// ============================================
// TechStandardSchema Tests
// ============================================

describe('TechStandardSchema', () => {
  const validStandard = {
    name: 'React',
    category: 'framework',
    source: 'tech-standards.md',
    confidence: 0.95,
    scope: 'global',
  };

  it('should accept valid tech standard', () => {
    const result = TechStandardSchema.safeParse(validStandard);
    expect(result.success).toBe(true);
  });

  it('should accept local scope', () => {
    const result = TechStandardSchema.safeParse({ ...validStandard, scope: 'local' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid scope', () => {
    const result = TechStandardSchema.safeParse({ ...validStandard, scope: 'invalid' });
    expect(result.success).toBe(false);
  });
});

// ============================================
// PhaseStatusSchema Tests
// ============================================

describe('PhaseStatusSchema', () => {
  const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'paused'];

  it('should accept all valid phase statuses', () => {
    for (const status of validStatuses) {
      const result = PhaseStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid status', () => {
    const result = PhaseStatusSchema.safeParse('unknown');
    expect(result.success).toBe(false);
  });
});

// ============================================
// ProjectStateSchema Tests
// ============================================

describe('ProjectStateSchema', () => {
  const validProjectState = {
    project_id: 'proj_001',
    project_name: 'Test Project',
    session_id: 'sess_abc',
    current_phase: 1,
    phase_status: 'in_progress',
    input_files: [
      {
        key: 'projects/proj_001/input/doc.pdf',
        name: 'doc.pdf',
        size: 1024,
        contentType: 'application/pdf',
        uploadedAt: '2026-01-15T10:00:00.000Z',
      },
    ],
    tech_standards_global: [],
    tech_standards_local: [],
  };

  it('should accept valid project state', () => {
    const result = ProjectStateSchema.safeParse(validProjectState);
    expect(result.success).toBe(true);
  });

  it('should accept null session_id', () => {
    const result = ProjectStateSchema.safeParse({ ...validProjectState, session_id: null });
    expect(result.success).toBe(true);
  });

  it('should reject current_phase below 0', () => {
    const result = ProjectStateSchema.safeParse({ ...validProjectState, current_phase: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject current_phase above 3', () => {
    const result = ProjectStateSchema.safeParse({ ...validProjectState, current_phase: 4 });
    expect(result.success).toBe(false);
  });

  it('should accept all valid phases (0-3)', () => {
    for (let phase = 0; phase <= 3; phase++) {
      const result = ProjectStateSchema.safeParse({ ...validProjectState, current_phase: phase });
      expect(result.success).toBe(true);
    }
  });

  it('should apply defaults for optional fields', () => {
    const result = ProjectStateSchema.safeParse(validProjectState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total_iterations).toBe(0);
      expect(result.data.total_duration_ms).toBe(0);
      expect(result.data.config).toEqual({});
    }
  });

  it('should accept optional artifact fields', () => {
    const withArtifacts = {
      ...validProjectState,
      artifact_vision_draft: '# Vision Draft',
      artifact_vision_final: '# Vision Final',
      artifact_architecture_draft: '# Arch Draft',
      artifact_architecture_final: '# Arch Final',
      artifact_decision_log: '## Decisions',
    };
    const result = ProjectStateSchema.safeParse(withArtifacts);
    expect(result.success).toBe(true);
  });

  it('should accept tech standards arrays', () => {
    const withStandards = {
      ...validProjectState,
      tech_standards_global: [
        { name: 'React', category: 'framework', source: 'std.md', confidence: 0.9, scope: 'global' },
      ],
      tech_standards_local: [
        { name: 'PostgreSQL', category: 'database', source: 'arch.md', confidence: 0.8, scope: 'local' },
      ],
    };
    const result = ProjectStateSchema.safeParse(withStandards);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tech_standards_global).toHaveLength(1);
      expect(result.data.tech_standards_local).toHaveLength(1);
    }
  });
});

// ============================================
// PresignedUrlRequestSchema Tests
// ============================================

describe('PresignedUrlRequestSchema', () => {
  const validRequest = {
    projectId: 'proj_001',
    filename: 'document.pdf',
    contentType: 'application/pdf',
  };

  it('should accept valid presigned URL request', () => {
    const result = PresignedUrlRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('should reject missing projectId', () => {
    const { projectId, ...invalid } = validRequest;
    const result = PresignedUrlRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject missing filename', () => {
    const { filename, ...invalid } = validRequest;
    const result = PresignedUrlRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject missing contentType', () => {
    const { contentType, ...invalid } = validRequest;
    const result = PresignedUrlRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept various content types', () => {
    const types = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    for (const contentType of types) {
      const result = PresignedUrlRequestSchema.safeParse({ ...validRequest, contentType });
      expect(result.success).toBe(true);
    }
  });
});

// ============================================
// PresignedUrlResponseSchema Tests
// ============================================

describe('PresignedUrlResponseSchema', () => {
  const validResponse = {
    uploadUrl: 'https://s3.example.com/bucket/key?signature=abc',
    key: 'projects/proj_001/input/document.pdf',
    expiresIn: 3600,
  };

  it('should accept valid presigned URL response', () => {
    const result = PresignedUrlResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('should reject invalid upload URL', () => {
    const result = PresignedUrlResponseSchema.safeParse({ ...validResponse, uploadUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer expiresIn', () => {
    const result = PresignedUrlResponseSchema.safeParse({ ...validResponse, expiresIn: 3600.5 });
    expect(result.success).toBe(false);
  });

  it('should accept various valid URLs', () => {
    const urls = [
      'https://s3.us-east-1.amazonaws.com/bucket/key',
      'http://localhost:8333/bucket/key',
      'https://seaweedfs.example.com/bucket/key?X-Amz-Signature=abc123',
    ];
    for (const uploadUrl of urls) {
      const result = PresignedUrlResponseSchema.safeParse({ ...validResponse, uploadUrl });
      expect(result.success).toBe(true);
    }
  });
});

// ============================================
// Edge Cases & Security Tests
// ============================================

describe('Security Edge Cases', () => {
  it('should handle path traversal attempts in filename', () => {
    // The schema doesn't prevent path traversal, but documents the concern
    const request = {
      projectId: 'proj_001',
      filename: '../../../etc/passwd',
      contentType: 'text/plain',
    };
    // Schema accepts it - validation should happen at API layer
    const result = PresignedUrlRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it('should handle very long strings', () => {
    const longString = 'a'.repeat(10000);
    const result = TechItemSchema.safeParse({
      id: longString,
      name: longString,
      type: 'technology',
      category: 'database',
      description: longString,
      source: longString,
      confidence: 0.5,
    });
    // Zod doesn't limit string length by default
    expect(result.success).toBe(true);
  });

  it('should handle unicode in strings', () => {
    const result = TechItemSchema.safeParse({
      id: 'tech_emoji_🚀',
      name: '数据库技术',
      type: 'technology',
      category: 'database',
      description: 'Описание на русском',
      source: 'ドキュメント.md',
      confidence: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it('should handle empty strings', () => {
    const result = TechItemSchema.safeParse({
      id: '',
      name: '',
      type: 'technology',
      category: 'database',
      description: '',
      source: '',
      confidence: 0.5,
    });
    // Schema allows empty strings - consider adding min length if needed
    expect(result.success).toBe(true);
  });
});
