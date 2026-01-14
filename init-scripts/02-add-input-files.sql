-- ============================================
-- AI Product Factory - Schema Migration v2
-- Add input_files column for S3-based document uploads
-- ============================================

-- Add input_files column to track uploaded documents
-- Structure: [{ key, name, size, contentType, uploadedAt }]
ALTER TABLE project_state
ADD COLUMN IF NOT EXISTS input_files JSONB DEFAULT '[]'::JSONB;

-- Add message_type column for generative UI support
-- Allows different message types: text, governance_request, phase_update
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS message_type VARCHAR(50) DEFAULT 'text';

-- Add payload column for rich message content (governance requests, etc.)
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS payload JSONB;

-- Create index for message type queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_type ON chat_messages(message_type);

-- Comment on new columns
COMMENT ON COLUMN project_state.input_files IS 'Array of S3 keys for user-uploaded input documents: [{key, name, size, contentType, uploadedAt}]';
COMMENT ON COLUMN chat_messages.message_type IS 'Type of chat message: text, governance_request, phase_update';
COMMENT ON COLUMN chat_messages.payload IS 'JSON payload for rich messages (governance requests, etc.)';
