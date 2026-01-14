export type ChatMessageType = "text" | "governance_request" | "phase_update";

export interface ChatMessage {
  id: string;
  project_id: string;
  session_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  message_type?: ChatMessageType;
  payload?: unknown;
  n8n_execution_id: string | null;
  response_time_ms: number | null;
  created_at: string;
}

export interface ChatRequest {
  message: string;
  projectId: string;
  sessionId?: string;
}

export interface ChatResponse {
  message: string;
  executionId?: string;
  phase?: number;
  status?: string;
  error?: string;
}

export interface N8nWebhookRequest {
  chatInput: string;
  projectId: string;
  sessionId: string;
  source: "dashboard";
}

export interface N8nWebhookResponse {
  output?: string;
  text?: string;
  response?: string;
  message?: string;
  error?: string;
  executionId?: string;
}
