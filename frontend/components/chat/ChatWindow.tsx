import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { GovernanceWidget } from "@/components/governance/GovernanceWidget";
import type { ChatMessage } from "@/types/chat";
import type { GovernancePayload, GovernanceResponse } from "@/lib/schemas";
import { GovernancePayloadSchema } from "@/lib/schemas";
import { cn, formatDateTime } from "@/lib/utils";

interface ExtendedChatMessage extends ChatMessage {
  message_type?: "text" | "governance_request" | "phase_update";
  payload?: unknown;
}

interface ChatWindowProps {
  messages: ExtendedChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  onGovernanceSubmit?: (response: GovernanceResponse) => Promise<void>;
  isLoading?: boolean;
  isSending?: boolean;
  projectName?: string;
}

export function ChatWindow({
  messages,
  onSendMessage,
  onGovernanceSubmit,
  isLoading,
  isSending,
  projectName,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const message = input.trim();
    setInput("");
    await onSendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 p-4 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}
            >
              <div className={cn("max-w-[80%]", i % 2 === 0 ? "items-end" : "items-start")}>
                <Skeleton className="h-20 w-64 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-12 w-12 text-muted-foreground mb-4"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <h3 className="text-lg font-semibold">Start a conversation</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Send a message to interact with the{" "}
                {projectName ? `"${projectName}"` : "project"} workflow
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                onGovernanceSubmit={onGovernanceSubmit}
              />
            ))
          )}
          {isSending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                  <div
                    className="w-2 h-2 bg-primary rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="w-2 h-2 bg-primary rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="min-h-[60px] max-h-[200px] resize-none"
            disabled={isSending}
          />
          <Button type="submit" disabled={!input.trim() || isSending}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </Button>
        </form>
      </div>
    </div>
  );
}

interface ChatBubbleProps {
  message: ExtendedChatMessage;
  onGovernanceSubmit?: (response: GovernanceResponse) => Promise<void>;
}

function ChatBubble({ message, onGovernanceSubmit }: ChatBubbleProps) {
  const isUser = message.role === "user";

  // Check if this is a governance request message
  if (message.message_type === "governance_request" && message.payload) {
    const parseResult = GovernancePayloadSchema.safeParse(message.payload);
    if (parseResult.success) {
      const handleSubmit = async (response: GovernanceResponse) => {
        if (onGovernanceSubmit) {
          await onGovernanceSubmit(response);
        } else {
          // Fallback: POST directly to API
          const res = await fetch("/api/governance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          if (!res.ok) {
            throw new Error("Failed to submit governance decisions");
          }
        }
      };

      return (
        <div className="flex justify-start">
          <GovernanceWidget
            payload={parseResult.data}
            onSubmit={handleSubmit}
          />
        </div>
      );
    }
  }

  // Check if this is a phase update message
  if (message.message_type === "phase_update") {
    return (
      <div className="flex justify-center">
        <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 rounded-full px-4 py-2 text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  // Default text message rendering
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-3",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        <div
          className={cn(
            "text-xs mt-2",
            isUser ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {formatDateTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}
