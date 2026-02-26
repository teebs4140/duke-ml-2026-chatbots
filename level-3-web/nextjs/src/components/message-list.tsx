/**
 * =============================================================
 * MessageList Component
 * =============================================================
 * A scrollable container that displays all chat messages.
 *
 * KEY FEATURE: Auto-scroll
 * When a new message arrives (or an existing message gets
 * updated via streaming), the list automatically scrolls to
 * the bottom so the user always sees the latest content.
 *
 * We use a hidden "scroll anchor" div at the bottom and call
 * scrollIntoView() on it whenever messages change.
 *
 * EMPTY STATE:
 * When there are no messages yet, we show a welcome message
 * with suggestions to help users get started.
 * =============================================================
 */

"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "@/components/message-bubble";
import type { Message } from "@/hooks/use-chat";
import { MessageSquare } from "lucide-react";

interface MessageListProps {
  /** Array of all messages in the conversation */
  messages: Message[];
  /** Whether the assistant is currently streaming a response */
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  /**
   * Ref to a hidden div at the bottom of the message list.
   * We scroll this into view whenever messages change.
   */
  const bottomRef = useRef<HTMLDivElement>(null);

  /**
   * Auto-scroll effect.
   * Runs whenever messages change (new message added, or
   * existing message updated during streaming).
   * The "smooth" behavior gives a nice animated scroll.
   */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // -------------------------------------------------------
  // Empty State - shown when no messages exist yet
  // -------------------------------------------------------
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          {/* Chat icon */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <MessageSquare className="h-8 w-8 text-primary" />
          </div>

          {/* Welcome text */}
          <h2 className="text-xl font-semibold mb-2">Duke ML Chatbot</h2>
          <p className="text-muted-foreground mb-6">
            Powered by Azure AI Foundry. Send a message to start chatting,
            or attach a file for the AI to analyze.
          </p>

          {/* Suggestion chips */}
          <div className="flex flex-wrap justify-center gap-2 text-sm">
            {[
              "Explain machine learning",
              "Write a Python function",
              "What is Duke University known for?",
            ].map((suggestion) => (
              <span
                key={suggestion}
                className="rounded-full border border-border px-3 py-1.5 text-muted-foreground"
              >
                {suggestion}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // Message List - scrollable container of message bubbles
  // -------------------------------------------------------
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto">
        {messages.map((message, index) => {
          // Determine if this is the last assistant message AND we're loading.
          // If so, it's the one being streamed right now.
          const isLastAssistant =
            message.role === "assistant" &&
            isLoading &&
            index === messages.length - 1;

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isStreaming={isLastAssistant}
            />
          );
        })}

        {/* Invisible scroll anchor - we scroll this into view */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
