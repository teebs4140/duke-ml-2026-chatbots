/**
 * =============================================================
 * MessageBubble Component
 * =============================================================
 * Renders a single chat message as a styled bubble.
 *
 * LAYOUT:
 *   - User messages:      Right-aligned, Duke Blue background
 *   - Assistant messages:  Left-aligned, light gray background
 *
 * FEATURES:
 *   - Markdown rendering for assistant messages (via react-markdown)
 *   - Typing indicator (animated dots) while streaming
 *   - Smooth appearance animation
 *
 * WHY REACT-MARKDOWN?
 * AI models often respond with markdown formatting: **bold**,
 * code blocks, lists, etc. react-markdown converts this to
 * proper HTML elements so the responses look great.
 * =============================================================
 */

"use client";

import ReactMarkdown from "react-markdown";
import type { Message } from "@/hooks/use-chat";

interface MessageBubbleProps {
  /** The message to display */
  message: Message;
  /** Whether this message is currently being streamed */
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? // User bubble: Duke Blue with white text
              "bg-primary text-primary-foreground rounded-br-md"
            : // Assistant bubble: light background with dark text
              "bg-secondary text-secondary-foreground rounded-bl-md"
        }`}
      >
        {isUser ? (
          // User messages are plain text (no markdown needed)
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            {/* Assistant messages use markdown rendering */}
            {message.content ? (
              <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs prose-code:bg-black/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-black/10 prose-pre:rounded-lg prose-pre:p-3">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            ) : isStreaming ? (
              // Typing indicator: three animated dots
              // Shown when the assistant message is empty and we're streaming
              <TypingIndicator />
            ) : null}

            {/* Show typing indicator at the end while still streaming */}
            {isStreaming && message.content && (
              <div className="mt-2">
                <TypingIndicator />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * TypingIndicator - Animated dots that show the AI is "thinking"
 *
 * Three dots that pulse in sequence, creating a familiar
 * "typing..." animation that users recognize from chat apps.
 * Each dot has a staggered animation-delay for the wave effect.
 */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <div
        className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
        style={{ animationDelay: "0ms", animationDuration: "1s" }}
      />
      <div
        className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
        style={{ animationDelay: "150ms", animationDuration: "1s" }}
      />
      <div
        className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
        style={{ animationDelay: "300ms", animationDuration: "1s" }}
      />
    </div>
  );
}
