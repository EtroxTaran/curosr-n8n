-- ============================================
-- AI Product Factory - Database Schema
-- Version: 1.0.0
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Project state table for tracking workflow progress
CREATE TABLE IF NOT EXISTS project_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL UNIQUE,
    project_name VARCHAR(255) NOT NULL,
    session_id VARCHAR(255),

    -- Phase tracking (0=Scavenging, 1=Vision, 2=Architecture, 3=Complete)
    current_phase INTEGER DEFAULT 0 CHECK (current_phase >= 0 AND current_phase <= 3),
    phase_status VARCHAR(50) DEFAULT 'pending' CHECK (phase_status IN ('pending', 'in_progress', 'completed', 'failed', 'paused')),

    -- Last iteration info
    last_iteration_phase INTEGER,
    last_iteration_number INTEGER,
    last_iteration_score DECIMAL(5,2),

    -- Tech standards (JSONB for flexibility)
    tech_standards_global JSONB DEFAULT '[]'::JSONB,
    tech_standards_local JSONB DEFAULT '[]'::JSONB,

    -- Artifact S3 paths
    artifact_vision_draft VARCHAR(500),
    artifact_vision_final VARCHAR(500),
    artifact_architecture_draft VARCHAR(500),
    artifact_architecture_final VARCHAR(500),
    artifact_decision_log VARCHAR(500),

    -- Telemetry
    total_iterations INTEGER DEFAULT 0,
    total_duration_ms BIGINT DEFAULT 0,

    -- Configuration snapshot
    config JSONB DEFAULT '{}'::JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Full state JSON (for complex nested data)
    full_state JSONB
);

-- Decision log entries table (normalized from decision_log.md)
CREATE TABLE IF NOT EXISTS decision_log_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL REFERENCES project_state(project_id) ON DELETE CASCADE,
    session_id VARCHAR(255),

    -- Entry details
    entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN (
        'log_decision', 'log_iteration', 'log_approval',
        'log_phase_start', 'log_phase_end', 'log_error', 'log_info'
    )),
    phase INTEGER,
    iteration INTEGER,
    content TEXT,

    -- Structured metadata
    metadata JSONB DEFAULT '{}'::JSONB,

    -- For iterations
    agent_name VARCHAR(100),
    score DECIMAL(5,2),
    issues_count INTEGER,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages table (for dashboard chat history)
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL REFERENCES project_state(project_id) ON DELETE CASCADE,
    session_id VARCHAR(255),

    -- Message details
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,

    -- Message type for special rendering (e.g., governance widget)
    message_type VARCHAR(50) DEFAULT 'text' CHECK (message_type IN (
        'text', 'governance_request', 'phase_update', 'error', 'system_notification'
    )),

    -- Rich payload for structured content (governance decisions, etc.)
    payload JSONB DEFAULT NULL,

    -- n8n response metadata
    n8n_execution_id VARCHAR(255),
    response_time_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_project_state_project_id ON project_state(project_id);
CREATE INDEX IF NOT EXISTS idx_project_state_current_phase ON project_state(current_phase);
CREATE INDEX IF NOT EXISTS idx_project_state_created_at ON project_state(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_state_updated_at ON project_state(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_state_phase_status ON project_state(phase_status);

CREATE INDEX IF NOT EXISTS idx_decision_log_project ON decision_log_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_decision_log_type ON decision_log_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_decision_log_created ON decision_log_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_log_phase ON decision_log_entries(phase);

CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_type ON chat_messages(message_type);

-- Function to update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger for auto-updating timestamps on project_state
DROP TRIGGER IF EXISTS update_project_state_updated_at ON project_state;
CREATE TRIGGER update_project_state_updated_at
    BEFORE UPDATE ON project_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Read-only user for dashboard (security best practice)
-- SECURITY: Password is set via DASHBOARD_READER_PASSWORD environment variable
-- If not set, the role is created without a password (login disabled)
DO $$
DECLARE
    pwd TEXT;
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'dashboard_reader') THEN
        -- Try to get password from environment variable via current_setting
        -- Note: This requires the environment variable to be set in postgresql.conf
        -- or passed via Docker environment. Falls back to a secure random password.
        pwd := current_setting('dashboard.reader_password', true);
        IF pwd IS NULL OR pwd = '' THEN
            -- Generate a secure random password if not provided
            pwd := encode(gen_random_bytes(32), 'base64');
            RAISE NOTICE 'No DASHBOARD_READER_PASSWORD set. Generated secure random password for dashboard_reader role.';
        END IF;
        EXECUTE format('CREATE ROLE dashboard_reader WITH LOGIN PASSWORD %L', pwd);
    END IF;
END
$$;

-- Grant read-only permissions to dashboard_reader
GRANT USAGE ON SCHEMA public TO dashboard_reader;
GRANT SELECT ON project_state TO dashboard_reader;
GRANT SELECT ON decision_log_entries TO dashboard_reader;
GRANT SELECT ON chat_messages TO dashboard_reader;

-- Grant insert on chat_messages (dashboard needs to log messages)
GRANT INSERT ON chat_messages TO dashboard_reader;

-- ============================================
-- Helper Views for Dashboard
-- ============================================

-- View: Project summary with latest activity
CREATE OR REPLACE VIEW project_summary AS
SELECT
    ps.id,
    ps.project_id,
    ps.project_name,
    ps.current_phase,
    ps.phase_status,
    ps.last_iteration_score,
    ps.total_iterations,
    ps.created_at,
    ps.updated_at,
    ps.completed_at,
    CASE ps.current_phase
        WHEN 0 THEN 'Scavenging'
        WHEN 1 THEN 'Vision Loop'
        WHEN 2 THEN 'Architecture Loop'
        WHEN 3 THEN 'Completed'
        ELSE 'Unknown'
    END AS phase_name,
    (SELECT COUNT(*) FROM decision_log_entries WHERE project_id = ps.project_id) AS decision_count,
    (SELECT MAX(created_at) FROM decision_log_entries WHERE project_id = ps.project_id) AS last_decision_at
FROM project_state ps
ORDER BY ps.updated_at DESC;

GRANT SELECT ON project_summary TO dashboard_reader;

-- View: Recent activity across all projects
CREATE OR REPLACE VIEW recent_activity AS
SELECT
    dle.id,
    dle.project_id,
    ps.project_name,
    dle.entry_type,
    dle.phase,
    dle.iteration,
    dle.agent_name,
    dle.score,
    dle.content,
    dle.created_at
FROM decision_log_entries dle
JOIN project_state ps ON ps.project_id = dle.project_id
ORDER BY dle.created_at DESC
LIMIT 100;

GRANT SELECT ON recent_activity TO dashboard_reader;
