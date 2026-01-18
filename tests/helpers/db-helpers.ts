/**
 * Database test helpers for integration tests
 * Provides utilities for project state CRUD and decision log operations
 */

import postgres from 'postgres';
import { TEST_CONFIG } from './service-availability';
import type { TestProject, DecisionLogEntry } from './test-fixtures';

// ============================================
// Database Client Creation
// ============================================

/**
 * Create PostgreSQL client with test configuration
 */
export function createDbClient(): ReturnType<typeof postgres> {
  return postgres(TEST_CONFIG.DATABASE_URL, {
    connect_timeout: 5,
    idle_timeout: 10,
    max: 10,
  });
}

// ============================================
// Project State Operations
// ============================================

export interface ProjectStateRow {
  project_id: string;
  project_name: string;
  session_id: string | null;
  current_phase: number;
  phase_status: string;
  tech_standards_global: unknown;
  tech_standards_local: unknown;
  artifact_vision_draft: string | null;
  artifact_vision_final: string | null;
  artifact_architecture_draft: string | null;
  artifact_architecture_final: string | null;
  artifact_decision_log: string | null;
  last_iteration_phase: number | null;
  last_iteration_number: number | null;
  last_iteration_score: number | null;
  total_iterations: number;
  total_duration_ms: number;
  config: unknown;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

/**
 * Insert a new project into database
 */
export async function insertProject(
  db: ReturnType<typeof postgres>,
  project: TestProject,
  overrides?: Partial<{
    current_phase: number;
    phase_status: string;
    config: Record<string, unknown>;
  }>
): Promise<ProjectStateRow> {
  const config = overrides?.config || {
    max_iterations: 5,
    score_threshold: 90,
  };

  const result = await db`
    INSERT INTO project_state (
      project_id,
      project_name,
      session_id,
      current_phase,
      phase_status,
      config
    ) VALUES (
      ${project.projectId},
      ${project.projectName},
      ${project.sessionId},
      ${overrides?.current_phase ?? 0},
      ${overrides?.phase_status ?? 'pending'},
      ${JSON.stringify(config)}::jsonb
    )
    RETURNING *
  `;

  return result[0] as ProjectStateRow;
}

/**
 * Get project state by ID
 */
export async function getProjectState(
  db: ReturnType<typeof postgres>,
  projectId: string
): Promise<ProjectStateRow | null> {
  const result = await db`
    SELECT * FROM project_state
    WHERE project_id = ${projectId}
  `;

  return result.length > 0 ? (result[0] as ProjectStateRow) : null;
}

/**
 * Update project phase and status
 */
export async function updateProjectPhase(
  db: ReturnType<typeof postgres>,
  projectId: string,
  phase: number,
  status: string
): Promise<void> {
  await db`
    UPDATE project_state
    SET
      current_phase = ${phase},
      phase_status = ${status},
      updated_at = NOW()
    WHERE project_id = ${projectId}
  `;
}

/**
 * Update project iteration tracking
 */
export async function updateProjectIteration(
  db: ReturnType<typeof postgres>,
  projectId: string,
  phase: number,
  iteration: number,
  score: number
): Promise<void> {
  await db`
    UPDATE project_state
    SET
      last_iteration_phase = ${phase},
      last_iteration_number = ${iteration},
      last_iteration_score = ${score},
      total_iterations = total_iterations + 1,
      updated_at = NOW()
    WHERE project_id = ${projectId}
  `;
}

/**
 * Update project tech standards
 */
export async function updateProjectTechStandards(
  db: ReturnType<typeof postgres>,
  projectId: string,
  globalStandards: unknown[],
  localStandards: unknown[]
): Promise<void> {
  await db`
    UPDATE project_state
    SET
      tech_standards_global = ${JSON.stringify(globalStandards)}::jsonb,
      tech_standards_local = ${JSON.stringify(localStandards)}::jsonb,
      updated_at = NOW()
    WHERE project_id = ${projectId}
  `;
}

/**
 * Update project artifact paths
 */
export async function updateProjectArtifacts(
  db: ReturnType<typeof postgres>,
  projectId: string,
  artifacts: Partial<{
    vision_draft: string | null;
    vision_final: string | null;
    architecture_draft: string | null;
    architecture_final: string | null;
    decision_log: string | null;
  }>
): Promise<void> {
  const updates: string[] = [];
  const values: unknown[] = [];

  if ('vision_draft' in artifacts) {
    updates.push('artifact_vision_draft');
    values.push(artifacts.vision_draft);
  }
  if ('vision_final' in artifacts) {
    updates.push('artifact_vision_final');
    values.push(artifacts.vision_final);
  }
  if ('architecture_draft' in artifacts) {
    updates.push('artifact_architecture_draft');
    values.push(artifacts.architecture_draft);
  }
  if ('architecture_final' in artifacts) {
    updates.push('artifact_architecture_final');
    values.push(artifacts.architecture_final);
  }
  if ('decision_log' in artifacts) {
    updates.push('artifact_decision_log');
    values.push(artifacts.decision_log);
  }

  if (updates.length === 0) return;

  // Build dynamic update query
  const setClauses = updates.map((col, i) => `${col} = $${i + 2}`).join(', ');

  await db.unsafe(
    `UPDATE project_state SET ${setClauses}, updated_at = NOW() WHERE project_id = $1`,
    [projectId, ...values]
  );
}

/**
 * Mark project as completed
 */
export async function completeProject(
  db: ReturnType<typeof postgres>,
  projectId: string,
  durationMs: number
): Promise<void> {
  await db`
    UPDATE project_state
    SET
      current_phase = 3,
      phase_status = 'completed',
      total_duration_ms = ${durationMs},
      completed_at = NOW(),
      updated_at = NOW()
    WHERE project_id = ${projectId}
  `;
}

/**
 * Delete a project by ID
 */
export async function deleteProject(
  db: ReturnType<typeof postgres>,
  projectId: string
): Promise<void> {
  // Delete related records first (foreign key constraints)
  await db`DELETE FROM chat_messages WHERE project_id = ${projectId}`;
  await db`DELETE FROM decision_log_entries WHERE project_id = ${projectId}`;
  await db`DELETE FROM project_state WHERE project_id = ${projectId}`;
}

// ============================================
// Decision Log Operations
// ============================================

/**
 * Insert a decision log entry
 */
export async function insertDecisionLogEntry(
  db: ReturnType<typeof postgres>,
  entry: DecisionLogEntry
): Promise<{ id: string }> {
  const result = await db`
    INSERT INTO decision_log_entries (
      project_id,
      session_id,
      entry_type,
      phase,
      iteration,
      agent_name,
      score,
      issues_count,
      content,
      metadata
    ) VALUES (
      ${entry.project_id},
      ${entry.session_id},
      ${entry.entry_type},
      ${entry.phase},
      ${entry.iteration},
      ${entry.agent_name},
      ${entry.score},
      ${entry.issues_count},
      ${entry.content},
      ${db.json(entry.metadata)}
    )
    RETURNING id
  `;

  return { id: result[0].id };
}

/**
 * Get decision log entries for a project
 */
export async function getDecisionLogEntries(
  db: ReturnType<typeof postgres>,
  projectId: string
): Promise<DecisionLogEntry[]> {
  const result = await db`
    SELECT * FROM decision_log_entries
    WHERE project_id = ${projectId}
    ORDER BY created_at ASC
  `;

  return result as DecisionLogEntry[];
}

/**
 * Get decision log entries by phase
 */
export async function getDecisionLogEntriesByPhase(
  db: ReturnType<typeof postgres>,
  projectId: string,
  phase: number
): Promise<DecisionLogEntry[]> {
  const result = await db`
    SELECT * FROM decision_log_entries
    WHERE project_id = ${projectId}
      AND phase = ${phase}
    ORDER BY created_at ASC
  `;

  return result as DecisionLogEntry[];
}

/**
 * Count decision log entries by type
 */
export async function countDecisionLogEntriesByType(
  db: ReturnType<typeof postgres>,
  projectId: string
): Promise<Record<string, number>> {
  const result = await db`
    SELECT entry_type, COUNT(*) as count
    FROM decision_log_entries
    WHERE project_id = ${projectId}
    GROUP BY entry_type
  `;

  const counts: Record<string, number> = {};
  for (const row of result) {
    counts[row.entry_type] = Number(row.count);
  }
  return counts;
}

// ============================================
// Chat Message Operations
// ============================================

export interface ChatMessageRow {
  id: string;
  project_id: string;
  session_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_type: string | null;
  payload: unknown;
  n8n_execution_id: string | null;
  response_time_ms: number | null;
  created_at: Date;
}

/**
 * Insert a chat message
 */
export async function insertChatMessage(
  db: ReturnType<typeof postgres>,
  message: Partial<ChatMessageRow> & {
    project_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
  }
): Promise<{ id: string }> {
  const result = await db`
    INSERT INTO chat_messages (
      project_id,
      session_id,
      role,
      content,
      message_type,
      payload,
      n8n_execution_id,
      response_time_ms
    ) VALUES (
      ${message.project_id},
      ${message.session_id || null},
      ${message.role},
      ${message.content},
      ${message.message_type || 'text'},
      ${JSON.stringify(message.payload || {})}::jsonb,
      ${message.n8n_execution_id || null},
      ${message.response_time_ms || null}
    )
    RETURNING id
  `;

  return { id: result[0].id };
}

/**
 * Get chat messages for a project
 */
export async function getChatMessages(
  db: ReturnType<typeof postgres>,
  projectId: string
): Promise<ChatMessageRow[]> {
  const result = await db`
    SELECT * FROM chat_messages
    WHERE project_id = ${projectId}
    ORDER BY created_at ASC
  `;

  return result as ChatMessageRow[];
}

// ============================================
// Cleanup Operations
// ============================================

/**
 * Delete all data for a project
 */
export async function cleanupProject(
  db: ReturnType<typeof postgres>,
  projectId: string
): Promise<void> {
  await deleteProject(db, projectId);
}

/**
 * Delete all data matching a test prefix
 */
export async function cleanupByTestPrefix(
  db: ReturnType<typeof postgres>,
  testPrefix: string
): Promise<{ deleted: number }> {
  // Delete chat messages
  await db`DELETE FROM chat_messages WHERE project_id LIKE ${testPrefix + '%'}`;

  // Delete decision log entries
  await db`DELETE FROM decision_log_entries WHERE project_id LIKE ${testPrefix + '%'}`;

  // Delete projects and get count
  const result = await db`
    DELETE FROM project_state
    WHERE project_id LIKE ${testPrefix + '%'}
    RETURNING project_id
  `;

  return { deleted: result.length };
}

/**
 * Reset test database (truncate all test tables)
 */
export async function resetTestDatabase(
  db: ReturnType<typeof postgres>
): Promise<void> {
  // Truncate in order respecting foreign keys
  await db`TRUNCATE chat_messages, decision_log_entries, project_state CASCADE`;
}

// ============================================
// Test Setup Helpers
// ============================================

/**
 * Setup a project at a specific phase
 */
export async function setupProjectAtPhase(
  db: ReturnType<typeof postgres>,
  project: TestProject,
  phase: number,
  status = 'in_progress'
): Promise<ProjectStateRow> {
  // Insert project
  const row = await insertProject(db, project, {
    current_phase: phase,
    phase_status: status,
  });

  // Add phase-appropriate data
  if (phase >= 1) {
    // Add tech standards
    await updateProjectTechStandards(
      db,
      project.projectId,
      [
        { name: 'PostgreSQL', category: 'database', source: 'test.md', confidence: 0.95, scope: 'global' },
        { name: 'React', category: 'framework', source: 'test.md', confidence: 0.92, scope: 'global' },
      ],
      []
    );
  }

  if (phase >= 2) {
    // Add vision artifact
    await updateProjectArtifacts(db, project.projectId, {
      vision_final: `projects/${project.projectId}/artifacts/ProductVision_FINAL.md`,
    });
  }

  if (phase >= 3) {
    // Add architecture artifact
    await updateProjectArtifacts(db, project.projectId, {
      architecture_final: `projects/${project.projectId}/artifacts/Architecture_FINAL.md`,
      decision_log: `projects/${project.projectId}/artifacts/decision_log.md`,
    });
    await completeProject(db, project.projectId, 1200000);
  }

  return getProjectState(db, project.projectId) as Promise<ProjectStateRow>;
}

/**
 * Setup a project with decision log entries
 */
export async function setupProjectWithDecisionLog(
  db: ReturnType<typeof postgres>,
  project: TestProject,
  entries: DecisionLogEntry[]
): Promise<{ project: ProjectStateRow; entries: DecisionLogEntry[] }> {
  const projectRow = await insertProject(db, project);

  for (const entry of entries) {
    await insertDecisionLogEntry(db, {
      ...entry,
      project_id: project.projectId,
    });
  }

  const savedEntries = await getDecisionLogEntries(db, project.projectId);

  return {
    project: projectRow,
    entries: savedEntries,
  };
}

// ============================================
// Assertion Helpers
// ============================================

/**
 * Assert project is at expected phase
 */
export async function assertProjectPhase(
  db: ReturnType<typeof postgres>,
  projectId: string,
  expectedPhase: number,
  expectedStatus?: string
): Promise<void> {
  const state = await getProjectState(db, projectId);

  if (!state) {
    throw new Error(`Project ${projectId} not found`);
  }

  if (state.current_phase !== expectedPhase) {
    throw new Error(
      `Expected phase ${expectedPhase}, got ${state.current_phase}`
    );
  }

  if (expectedStatus && state.phase_status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${state.phase_status}`
    );
  }
}

/**
 * Assert decision log has expected entries
 */
export async function assertDecisionLogHasEntries(
  db: ReturnType<typeof postgres>,
  projectId: string,
  expectedTypes: string[]
): Promise<void> {
  const counts = await countDecisionLogEntriesByType(db, projectId);

  for (const type of expectedTypes) {
    if (!counts[type] || counts[type] < 1) {
      throw new Error(`Expected at least one ${type} entry, found ${counts[type] || 0}`);
    }
  }
}
