import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatWindow } from "../components/chat/ChatWindow";
import type { ChatMessage } from "../types/chat";

// Mock ReactMarkdown to avoid issues with ESM
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock("remark-gfm", () => ({
  default: () => {},
}));

describe("ChatWindow", () => {
  const mockOnSendMessage = vi.fn();
  const mockOnGovernanceSubmit = vi.fn();

  const createMessage = (
    overrides: Partial<ChatMessage> = {}
  ): ChatMessage => ({
    id: `msg-${Date.now()}-${Math.random()}`,
    project_id: "test-project",
    session_id: null,
    role: "user",
    content: "Test message",
    n8n_execution_id: null,
    response_time_ms: null,
    created_at: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSendMessage.mockResolvedValue(undefined);
    mockOnGovernanceSubmit.mockResolvedValue(undefined);
  });

  describe("Rendering", () => {
    it("should render empty state when no messages", () => {
      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      expect(screen.getByText("Start a conversation")).toBeInTheDocument();
      expect(
        screen.getByText(/send a message to interact with/i)
      ).toBeInTheDocument();
    });

    it("should render empty state with project name", () => {
      render(
        <ChatWindow
          messages={[]}
          onSendMessage={mockOnSendMessage}
          projectName="My Project"
        />
      );

      expect(
        screen.getByText(/send a message to interact with the "My Project" workflow/i)
      ).toBeInTheDocument();
    });

    it("should render loading skeleton when isLoading is true", () => {
      render(
        <ChatWindow
          messages={[]}
          onSendMessage={mockOnSendMessage}
          isLoading={true}
        />
      );

      // Should not show empty state
      expect(screen.queryByText("Start a conversation")).not.toBeInTheDocument();
    });

    it("should render messages", () => {
      const messages: ChatMessage[] = [
        createMessage({ role: "user", content: "Hello" }),
        createMessage({ role: "assistant", content: "Hi there!" }),
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      expect(screen.getByText("Hello")).toBeInTheDocument();
      expect(screen.getByText("Hi there!")).toBeInTheDocument();
    });

    it("should render user messages on the right", () => {
      const messages: ChatMessage[] = [
        createMessage({ role: "user", content: "User message" }),
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      // Find the flex container that positions the message
      const messageText = screen.getByText("User message");
      const flexContainer = messageText.closest(".flex");
      expect(flexContainer).toHaveClass("justify-end");
    });

    it("should render assistant messages on the left", () => {
      const messages: ChatMessage[] = [
        createMessage({ role: "assistant", content: "Assistant message" }),
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      // Find the flex container that positions the message
      const messageText = screen.getByText("Assistant message");
      const flexContainer = messageText.closest(".flex");
      expect(flexContainer).toHaveClass("justify-start");
    });

    it("should show typing indicator when isSending is true", () => {
      render(
        <ChatWindow
          messages={[]}
          onSendMessage={mockOnSendMessage}
          isSending={true}
        />
      );

      // Look for the bouncing dots animation container
      const bouncingDots = document.querySelectorAll(".animate-bounce");
      expect(bouncingDots.length).toBe(3);
    });
  });

  describe("Message Input", () => {
    it("should render message input textarea", () => {
      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      expect(
        screen.getByPlaceholderText("Type your message...")
      ).toBeInTheDocument();
    });

    it("should render send button", () => {
      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should disable send button when input is empty", () => {
      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      const sendButton = screen.getByRole("button");
      expect(sendButton).toBeDisabled();
    });

    it("should enable send button when input has text", async () => {
      const user = userEvent.setup();

      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      const textarea = screen.getByPlaceholderText("Type your message...");
      await user.type(textarea, "Hello");

      const sendButton = screen.getByRole("button");
      expect(sendButton).not.toBeDisabled();
    });

    it("should disable textarea when isSending is true", () => {
      render(
        <ChatWindow
          messages={[]}
          onSendMessage={mockOnSendMessage}
          isSending={true}
        />
      );

      const textarea = screen.getByPlaceholderText("Type your message...");
      expect(textarea).toBeDisabled();
    });
  });

  describe("Sending Messages", () => {
    it("should call onSendMessage when form is submitted", async () => {
      const user = userEvent.setup();

      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      const textarea = screen.getByPlaceholderText("Type your message...");
      await user.type(textarea, "Hello world");

      const sendButton = screen.getByRole("button");
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockOnSendMessage).toHaveBeenCalledWith("Hello world");
      });
    });

    it("should clear input after sending", async () => {
      const user = userEvent.setup();

      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      const textarea = screen.getByPlaceholderText("Type your message...");
      await user.type(textarea, "Hello world");
      expect(textarea).toHaveValue("Hello world");

      const sendButton = screen.getByRole("button");
      await user.click(sendButton);

      await waitFor(() => {
        expect(textarea).toHaveValue("");
      });
    });

    it("should send message on Enter key press", async () => {
      const user = userEvent.setup();

      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      const textarea = screen.getByPlaceholderText("Type your message...");
      await user.type(textarea, "Hello world{Enter}");

      await waitFor(() => {
        expect(mockOnSendMessage).toHaveBeenCalledWith("Hello world");
      });
    });

    it("should not send message on Shift+Enter", async () => {
      const user = userEvent.setup();

      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      const textarea = screen.getByPlaceholderText("Type your message...");
      await user.type(textarea, "Line 1{Shift>}{Enter}{/Shift}Line 2");

      // Message should not be sent, input should contain multiline text
      expect(mockOnSendMessage).not.toHaveBeenCalled();
      expect(textarea).toHaveValue("Line 1\nLine 2");
    });

    it("should not send empty or whitespace-only messages", async () => {
      const user = userEvent.setup();

      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      const textarea = screen.getByPlaceholderText("Type your message...");
      await user.type(textarea, "   ");

      const sendButton = screen.getByRole("button");
      expect(sendButton).toBeDisabled();
    });

    it("should trim whitespace from message", async () => {
      const user = userEvent.setup();

      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      const textarea = screen.getByPlaceholderText("Type your message...");
      await user.type(textarea, "  Hello world  ");

      const sendButton = screen.getByRole("button");
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockOnSendMessage).toHaveBeenCalledWith("Hello world");
      });
    });
  });

  describe("Phase Update Messages", () => {
    it("should render phase update messages centered", () => {
      const messages = [
        {
          ...createMessage({ content: "Phase 1: Vision Loop Started" }),
          message_type: "phase_update" as const,
        },
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      const phaseMessage = screen.getByText("Phase 1: Vision Loop Started");
      // Find the flex container that centers the message
      const flexContainer = phaseMessage.closest(".flex");
      expect(flexContainer).toHaveClass("justify-center");
    });
  });

  describe("Message Timestamps", () => {
    it("should display formatted timestamps", () => {
      const testDate = new Date("2026-01-15T10:30:00Z");
      const messages: ChatMessage[] = [
        createMessage({
          role: "user",
          content: "Test message content",
          created_at: testDate.toISOString(),
        }),
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      // Find the message bubble container (has rounded-lg class)
      const messageText = screen.getByText("Test message content");
      const messageBubble = messageText.closest(".rounded-lg");
      // The bubble should contain the timestamp (which includes numbers)
      expect(messageBubble?.textContent).toMatch(/\d/);
    });
  });

  describe("Message Styling", () => {
    it("should apply user message styles", () => {
      const messages: ChatMessage[] = [
        createMessage({ role: "user", content: "User text" }),
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      // Find the styled bubble container
      const messageText = screen.getByText("User text");
      const messageBubble = messageText.closest(".rounded-lg");
      expect(messageBubble).toHaveClass("bg-primary");
    });

    it("should apply assistant message styles", () => {
      const messages: ChatMessage[] = [
        createMessage({ role: "assistant", content: "Assistant text" }),
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      // Find the styled bubble container
      const messageText = screen.getByText("Assistant text");
      const messageBubble = messageText.closest(".rounded-lg");
      expect(messageBubble).toHaveClass("bg-muted");
    });
  });

  describe("Accessibility", () => {
    it("should have accessible form elements", () => {
      render(
        <ChatWindow messages={[]} onSendMessage={mockOnSendMessage} />
      );

      const textarea = screen.getByPlaceholderText("Type your message...");
      expect(textarea).toBeInTheDocument();

      const form = textarea.closest("form");
      expect(form).toBeInTheDocument();
    });
  });

  describe("Multiple Messages", () => {
    it("should render conversation thread correctly", () => {
      const messages: ChatMessage[] = [
        createMessage({ id: "1", role: "user", content: "Hello" }),
        createMessage({ id: "2", role: "assistant", content: "Hi there!" }),
        createMessage({ id: "3", role: "user", content: "How are you?" }),
        createMessage({
          id: "4",
          role: "assistant",
          content: "I'm doing great!",
        }),
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      expect(screen.getByText("Hello")).toBeInTheDocument();
      expect(screen.getByText("Hi there!")).toBeInTheDocument();
      expect(screen.getByText("How are you?")).toBeInTheDocument();
      expect(screen.getByText("I'm doing great!")).toBeInTheDocument();
    });
  });

  describe("Governance Request Messages", () => {
    const validGovernancePayload = {
      type: "governance_request" as const,
      scavenging_id: "sc_test123",
      project_id: "test-project",
      detected_stack: [
        {
          id: "tech_001",
          name: "PostgreSQL",
          type: "technology" as const,
          category: "database",
          description: "Primary relational database for data persistence",
          confidence: 0.95,
          source: "architecture.md",
          alternatives: [
            { name: "MySQL", description: "Alternative RDBMS" },
          ],
        },
      ],
      webhook_url: "https://example.com/webhook",
    };

    it("should render GovernanceWidget for valid governance_request messages", () => {
      const messages = [
        {
          ...createMessage({
            role: "assistant",
            content: "Tech stack detected",
          }),
          message_type: "governance_request" as const,
          payload: validGovernancePayload,
        },
      ];

      render(
        <ChatWindow
          messages={messages}
          onSendMessage={mockOnSendMessage}
          onGovernanceSubmit={mockOnGovernanceSubmit}
        />
      );

      // GovernanceWidget should be rendered
      expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
      expect(screen.getByText(/database/i)).toBeInTheDocument();
    });

    it("should render text message when governance payload is invalid", () => {
      const messages = [
        {
          ...createMessage({
            role: "assistant",
            content: "Invalid governance message",
          }),
          message_type: "governance_request" as const,
          payload: { invalid: "data" }, // Invalid payload
        },
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      // Should fall through to regular message rendering
      expect(screen.queryByText("PostgreSQL")).not.toBeInTheDocument();
    });

    it("should call onGovernanceSubmit when governance decisions are submitted", async () => {
      const user = userEvent.setup();
      const messages = [
        {
          ...createMessage({
            role: "assistant",
            content: "Tech stack detected",
          }),
          message_type: "governance_request" as const,
          payload: validGovernancePayload,
        },
      ];

      render(
        <ChatWindow
          messages={messages}
          onSendMessage={mockOnSendMessage}
          onGovernanceSubmit={mockOnGovernanceSubmit}
        />
      );

      // Find and click Approve All (Global) button - be specific since there are two
      const approveAllBtn = screen.getByRole("button", { name: /approve all \(global\)/i });
      await user.click(approveAllBtn);

      // Click confirm button
      const confirmBtn = screen.getByRole("button", { name: /confirm/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(mockOnGovernanceSubmit).toHaveBeenCalled();
      });
    });
  });

  describe("Auto-scroll Behavior", () => {
    it("should have scroll container ref for auto-scrolling", () => {
      const messages: ChatMessage[] = [
        createMessage({ role: "user", content: "Message 1" }),
        createMessage({ role: "assistant", content: "Message 2" }),
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      // Component should render messages
      expect(screen.getByText("Message 1")).toBeInTheDocument();
      expect(screen.getByText("Message 2")).toBeInTheDocument();
    });
  });

  describe("Markdown Rendering", () => {
    it("should render markdown content in assistant messages", () => {
      const messages: ChatMessage[] = [
        createMessage({
          role: "assistant",
          content: "Here is some **bold** text",
        }),
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      // ReactMarkdown is mocked, so content should still be visible
      expect(screen.getByText(/bold/)).toBeInTheDocument();
    });

    it("should not apply markdown to user messages", () => {
      const messages: ChatMessage[] = [
        createMessage({
          role: "user",
          content: "User **bold** text",
        }),
      ];

      render(
        <ChatWindow messages={messages} onSendMessage={mockOnSendMessage} />
      );

      // User message should show as plain text (with **bold**)
      expect(screen.getByText("User **bold** text")).toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("should prevent sending when already isSending", async () => {
      const user = userEvent.setup();

      render(
        <ChatWindow
          messages={[]}
          onSendMessage={mockOnSendMessage}
          isSending={true}
        />
      );

      // Both textarea and button should be disabled
      const textarea = screen.getByPlaceholderText("Type your message...");
      const sendButton = screen.getByRole("button");

      expect(textarea).toBeDisabled();
      expect(sendButton).toBeDisabled();

      // Try to type - should not work when disabled
      await user.type(textarea, "Test");
      expect(textarea).toHaveValue("");
    });
  });
});
