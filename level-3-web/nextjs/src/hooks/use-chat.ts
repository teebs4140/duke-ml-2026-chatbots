/**
 * =============================================================
 * useChat - Custom React Hook for Chat State Management
 * =============================================================
 *
 * This hook encapsulates ALL chat-related state and logic:
 *   - Message history (user + assistant messages)
 *   - Loading/streaming state
 *   - Multi-turn conversation chaining via previousResponseId
 *   - File attachment handling (convert to base64)
 *   - SSE stream reading and progressive message updates
 *
 * HOW IT WORKS:
 * 1. User types a message and optionally attaches a file
 * 2. sendMessage() adds the user message to state
 * 3. It POSTs to /api/chat with the message + settings
 * 4. The server streams back SSE events (delta, done, error)
 * 5. We read the stream with a ReadableStream reader
 * 6. Each delta updates the assistant message progressively
 * 7. On "done", we store the responseId for the next turn
 *
 * WHY A CUSTOM HOOK?
 * Custom hooks let us separate logic from UI. The ChatInterface
 * component just calls useChat() and gets back state + actions.
 * This makes both the hook and the component easier to test
 * and understand independently.
 *
 * =============================================================
 */

"use client";

import { useState, useCallback, useRef } from "react";

/**
 * Represents a single message in the conversation.
 * Both user and assistant messages use this same shape.
 */
export interface Message {
  /** "user" or "assistant" */
  role: "user" | "assistant";
  /** The text content of the message */
  content: string;
  /** Unique ID for React's key prop (we use crypto.randomUUID) */
  id: string;
}

/**
 * Settings that can be configured per-request.
 * These come from the SettingsPanel component.
 */
export interface ChatSettings {
  /** System instructions / personality for the AI */
  instructions?: string;
  /** Model deployment name (e.g., "gpt-4o") */
  model?: string;
  /** How hard the model should reason: low, medium, or high */
  reasoningEffort?: "low" | "medium" | "high";
}

/**
 * File attachment data ready to send to the API.
 * Created by converting a browser File object to base64.
 */
export interface FileAttachment {
  /** Original filename (e.g., "photo.png") */
  name: string;
  /** Base64-encoded file data (includes data URI prefix) */
  data: string;
  /** MIME type (e.g., "image/png", "text/plain") */
  mimeType: string;
}

/**
 * Token usage stats from the API.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * The return type of useChat() - everything the UI needs.
 */
export interface UseChatReturn {
  /** Array of all messages in the conversation */
  messages: Message[];
  /** True while waiting for / receiving a response */
  isLoading: boolean;
  /** Error message if something went wrong */
  error: string | null;
  /** Token usage from the last response */
  usage: TokenUsage | null;
  /** Send a new message (with optional file and settings) */
  sendMessage: (
    text: string,
    file?: File | null,
    settings?: ChatSettings
  ) => Promise<void>;
  /** Reset the conversation to start fresh */
  clearChat: () => void;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const DEFAULT_FILE_ONLY_MESSAGE = "Uploaded a file";

interface StreamDeltaEvent {
  type: "delta";
  text: string;
}

interface StreamUsageEvent {
  type: "usage";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface StreamDoneEvent {
  type: "done";
  responseId?: string;
}

interface StreamErrorEvent {
  type: "error";
  message?: string;
}

type StreamEvent =
  | StreamDeltaEvent
  | StreamUsageEvent
  | StreamDoneEvent
  | StreamErrorEvent;

interface StreamEventHandlers {
  onDelta: (text: string) => void;
  onUsage: (usage: TokenUsage) => void;
  onDone: (responseId?: string) => void;
  onError: (message?: string) => never;
}

function parseSseEventBlock(eventBlock: string): StreamEvent | null {
  const dataLines = eventBlock
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return null;
  }

  const payload = dataLines.join("\n");
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload) as StreamEvent;
  } catch {
    return null;
  }
}

function handleStreamEvent(
  data: StreamEvent,
  handlers: StreamEventHandlers
): void {
  if (data.type === "delta") {
    handlers.onDelta(data.text);
    return;
  }

  if (data.type === "usage") {
    handlers.onUsage({
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.totalTokens,
    });
    return;
  }

  if (data.type === "done") {
    handlers.onDone(data.responseId);
    return;
  }

  if (data.type === "error") {
    handlers.onError(data.message);
  }
}

/**
 * Convert a browser File object to a base64-encoded FileAttachment.
 *
 * Uses the FileReader API to read the file as a Data URL,
 * which gives us a string like "data:image/png;base64,iVBOR...".
 * We send this whole string to the API and let the server
 * strip the prefix.
 */
function fileToBase64(file: File): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    // When the file finishes reading, resolve with the data
    reader.onload = () => {
      resolve({
        name: file.name,
        data: reader.result as string,
        mimeType: file.type || "application/octet-stream",
      });
    };

    // If reading fails, reject the promise
    reader.onerror = () => reject(new Error("Failed to read file"));

    // Start reading - this is async and triggers onload when done
    reader.readAsDataURL(file);
  });
}

/**
 * useChat() - The main chat hook.
 *
 * Usage in a component:
 *   const { messages, isLoading, sendMessage, clearChat } = useChat();
 */
export function useChat(): UseChatReturn {
  // -------------------------------------------------------
  // State
  // -------------------------------------------------------

  /** All messages in the conversation (user + assistant) */
  const [messages, setMessages] = useState<Message[]>([]);

  /** True while we're waiting for or streaming a response */
  const [isLoading, setIsLoading] = useState(false);

  /**
   * The ID from the last assistant response.
   * We send this with each request so the Responses API
   * knows which conversation we're continuing.
   * This is what makes multi-turn conversation work without
   * sending the entire message history each time!
   */
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(
    null
  );

  /** Error message to display to the user */
  const [error, setError] = useState<string | null>(null);

  /** Token usage from the last response */
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const requestIdRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  // -------------------------------------------------------
  // sendMessage - The core function
  // -------------------------------------------------------
  const sendMessage = useCallback(
    async (
      text: string,
      file?: File | null,
      settings?: ChatSettings
    ): Promise<void> => {
      if (isLoading) return;

      // Don't send empty messages
      if (!text.trim() && !file) return;

      if (file && file.size > MAX_FILE_SIZE_BYTES) {
        setError("File is too large. Maximum size is 20 MB.");
        return;
      }

      // Clear any previous errors
      setError(null);
      setIsLoading(true);

      // --- Step 1: Add the user's message to the conversation ---
      const userMessage: Message = {
        role: "user",
        content: text || (file ? `${DEFAULT_FILE_ONLY_MESSAGE}: ${file.name}` : ""),
        id: crypto.randomUUID(),
      };

      // --- Step 2: Create a placeholder for the assistant's response ---
      // We add this immediately so the UI shows a "typing" state.
      // The content starts empty and gets filled as deltas arrive.
      const assistantMessage: Message = {
        role: "assistant",
        content: "",
        id: crypto.randomUUID(),
      };

      // Add both messages to state at once
      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      const controller = new AbortController();
      activeControllerRef.current = controller;

      try {
        // --- Step 3: Convert file to base64 if attached ---
        let fileAttachment: FileAttachment | undefined;
        if (file) {
          fileAttachment = await fileToBase64(file);
        }

        // --- Step 4: Build the request body ---
        const requestBody: Record<string, unknown> = {
          message: text,
        };

        // Only include optional fields if they have values.
        // This keeps the request clean and lets the server
        // use its defaults for omitted fields.
        if (previousResponseId) {
          requestBody.previousResponseId = previousResponseId;
        }
        if (settings?.instructions) {
          requestBody.instructions = settings.instructions;
        }
        if (settings?.model) {
          requestBody.model = settings.model;
        }
        if (settings?.reasoningEffort) {
          requestBody.reasoningEffort = settings.reasoningEffort;
        }
        if (fileAttachment) {
          requestBody.file = fileAttachment;
        }

        // --- Step 5: Send the request to our API route ---
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        // Check for HTTP errors (4xx, 5xx)
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.error || `Server error: ${response.status}`
          );
        }

        // --- Step 6: Read the SSE stream ---
        // The response body is a ReadableStream of SSE events.
        // We use getReader() to read it chunk by chunk.
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response stream available");
        }

        const decoder = new TextDecoder();
        let accumulatedText = "";
        let sseBuffer = "";
        const eventHandlers: StreamEventHandlers = {
          onDelta: (textDelta) => {
            accumulatedText += textDelta;
            const newContent = accumulatedText;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: newContent }
                  : msg
              )
            );
          },
          onUsage: (tokenUsage) => {
            setUsage(tokenUsage);
          },
          onDone: (responseId) => {
            if (responseId) {
              setPreviousResponseId(responseId);
            }
          },
          onError: (message) => {
            throw new Error(message || "Streaming error");
          },
        };

        // Keep reading chunks until the stream is done
        while (true) {
          const { done, value } = await reader.read();

          // Stream is complete
          if (done) {
            sseBuffer += decoder.decode();

            const finalEvents = sseBuffer
              .split("\n\n")
              .map((event) => event.trim())
              .filter(Boolean);

            for (const rawEvent of finalEvents) {
              if (requestId !== requestIdRef.current) {
                continue;
              }

              const data = parseSseEventBlock(rawEvent);
              if (!data) continue;
              handleStreamEvent(data, eventHandlers);
            }
            break;
          }

          // Decode the binary chunk to a string
          sseBuffer += decoder.decode(value, { stream: true });

          // SSE events are separated by blank lines.
          const rawEvents = sseBuffer.split("\n\n");
          sseBuffer = rawEvents.pop() || "";

          for (const rawEvent of rawEvents) {
            if (requestId !== requestIdRef.current) {
              continue;
            }

            const data = parseSseEventBlock(rawEvent);
            if (!data) continue;
            handleStreamEvent(data, eventHandlers);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        // --- Error Handling ---
        // If anything goes wrong, show the error and remove
        // the empty assistant message placeholder.
        const errorMsg =
          err instanceof Error ? err.message : "An unexpected error occurred";
        setError(errorMsg);

        // Remove the empty assistant message since we failed
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== assistantMessage.id)
        );
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }

        // Always reset loading state for the active request.
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [isLoading, previousResponseId]
  );

  // -------------------------------------------------------
  // clearChat - Reset everything for a new conversation
  // -------------------------------------------------------
  const clearChat = useCallback(() => {
    requestIdRef.current += 1;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    setMessages([]);
    setPreviousResponseId(null);
    setError(null);
    setUsage(null);
    setIsLoading(false);
  }, []);

  // Return the state and actions for the UI to use
  return {
    messages,
    isLoading,
    error,
    usage,
    sendMessage,
    clearChat,
  };
}
