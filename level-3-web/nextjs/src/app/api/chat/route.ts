/**
 * =============================================================
 * POST /api/chat - Chat API Route (Server-Side)
 * =============================================================
 *
 * This is the CORE backend file for the chatbot. It handles:
 *
 * 1. Receiving chat messages from the frontend
 * 2. Forwarding them to Azure AI Foundry via the OpenAI SDK
 * 3. Streaming the response back as Server-Sent Events (SSE)
 *
 * KEY CONCEPT: The Responses API
 * ------------------------------
 * Unlike the older Chat Completions API which requires you to
 * send the full conversation history with every request, the
 * Responses API uses `previous_response_id` to chain messages.
 * The server remembers the conversation, so we only send the
 * new message each time. This is simpler and more efficient.
 *
 * KEY CONCEPT: Server-Sent Events (SSE)
 * --------------------------------------
 * Instead of waiting for the entire response to generate
 * (which could take 10+ seconds), we stream it token by token.
 * The frontend receives small chunks and displays them in
 * real time, creating the "typing" effect users expect.
 *
 * SSE FORMAT:
 *   data: {"type":"delta","text":"Hello"}    // a chunk of text
 *   data: {"type":"done","responseId":"..."}  // stream complete
 *   data: {"type":"error","message":"..."}    // something went wrong
 *
 * =============================================================
 */

import { NextRequest } from "next/server";
import OpenAI from "openai";
import type { ResponseInput } from "openai/resources/responses/responses";

/**
 * Shape of the request body we expect from the frontend.
 * All fields except `message` are optional.
 */
interface ChatRequestBody {
  /** The user's message text */
  message?: string;
  /** ID from the previous response - enables multi-turn conversations */
  previousResponseId?: string;
  /** System instructions that shape the AI's personality */
  instructions?: string;
  /** Which model deployment to use (e.g., "gpt-4o", "gpt-4.1") */
  model?: string;
  /** How hard the model should "think" - low/medium/high */
  reasoningEffort?: "low" | "medium" | "high";
  /** Optional file attachment (base64 encoded) */
  file?: {
    name: string;
    /** Base64-encoded file data (with or without data URI prefix) */
    data: string;
    mimeType?: string;
  };
}

type ReasoningEffort = "low" | "medium" | "high";

const VALID_REASONING_EFFORTS = new Set<ReasoningEffort>([
  "low",
  "medium",
  "high",
]);
const DEFAULT_FILE_ONLY_MESSAGE = "Please analyze the attached file.";

const MAX_FILE_SIZE_BYTES = readPositiveInt(
  process.env.MAX_FILE_SIZE_BYTES,
  20 * 1024 * 1024
);
const RATE_LIMIT_WINDOW_MS = readPositiveInt(
  process.env.CHAT_RATE_LIMIT_WINDOW_MS,
  60_000
);
const RATE_LIMIT_MAX = readPositiveInt(process.env.CHAT_RATE_LIMIT_MAX, 30);
const CHAT_API_TOKEN = (process.env.CHAT_API_TOKEN || "").trim();

interface RateLimitEntry {
  count: number;
  windowStartMs: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [first] = forwardedFor.split(",");
    if (first?.trim()) {
      return first.trim();
    }
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(clientKey: string): boolean {
  const nowMs = Date.now();
  const existing = rateLimitStore.get(clientKey);

  if (!existing || nowMs - existing.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(clientKey, { count: 1, windowStartMs: nowMs });
    return false;
  }

  existing.count += 1;
  return existing.count > RATE_LIMIT_MAX;
}

function parseDataField(data: string): {
  base64Data: string;
  detectedMimeType: string | null;
} {
  const commaIndex = data.indexOf(",");
  if (commaIndex < 0) {
    return {
      base64Data: data,
      detectedMimeType: null,
    };
  }

  const header = data.slice(0, commaIndex);
  const mimeMatch = /^data:([^;]+);base64$/i.exec(header.trim());

  return {
    base64Data: data.slice(commaIndex + 1),
    detectedMimeType: mimeMatch?.[1]?.toLowerCase() || null,
  };
}

function estimateBase64DecodedBytes(base64Data: string): number {
  const sanitized = base64Data.replace(/\s/g, "");
  if (!sanitized) return 0;
  const padding = sanitized.endsWith("==")
    ? 2
    : sanitized.endsWith("=")
      ? 1
      : 0;
  return Math.max(0, Math.floor((sanitized.length * 3) / 4) - padding);
}

/**
 * POST handler - processes incoming chat messages.
 *
 * Next.js App Router uses named exports (GET, POST, etc.)
 * to define API route handlers. This function runs on the
 * server, so environment variables are accessible and secure.
 */
export async function POST(request: NextRequest) {
  try {
    // -------------------------------------------------------
    // Step 0: Lightweight protection (optional auth + rate limit)
    // -------------------------------------------------------
    if (CHAT_API_TOKEN) {
      const providedToken = request.headers.get("x-chat-token");
      if (providedToken !== CHAT_API_TOKEN) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
    }

    if (RATE_LIMIT_MAX > 0 && RATE_LIMIT_WINDOW_MS > 0) {
      const clientIp = getClientIp(request);
      if (isRateLimited(clientIp)) {
        return jsonResponse(
          { error: "Too many requests. Please try again in a minute." },
          429
        );
      }
    }

    // -------------------------------------------------------
    // Step 1: Validate environment variables
    // -------------------------------------------------------
    // These MUST be set in .env.local (never commit real values!)
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;

    if (!endpoint || !apiKey) {
      return jsonResponse(
        {
          error:
            "Server configuration error: AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set in .env.local",
        },
        500
      );
    }

    // -------------------------------------------------------
    // Step 2: Parse the request body
    // -------------------------------------------------------
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON request body" }, 400);
    }

    if (!isObject(body)) {
      return jsonResponse({ error: "Request body must be a JSON object" }, 400);
    }

    const typedBody = body as ChatRequestBody;
    const {
      message: rawMessage,
      previousResponseId: rawPreviousResponseId,
      instructions: rawInstructions,
      model: rawModel,
      reasoningEffort: rawReasoningEffort,
      file: rawFile,
    } = typedBody;

    if (rawMessage !== undefined && typeof rawMessage !== "string") {
      return jsonResponse({ error: "message must be a string" }, 400);
    }
    if (rawPreviousResponseId !== undefined && typeof rawPreviousResponseId !== "string") {
      return jsonResponse({ error: "previousResponseId must be a string" }, 400);
    }
    if (rawInstructions !== undefined && typeof rawInstructions !== "string") {
      return jsonResponse({ error: "instructions must be a string" }, 400);
    }
    if (rawModel !== undefined && typeof rawModel !== "string") {
      return jsonResponse({ error: "model must be a string" }, 400);
    }
    if (
      rawReasoningEffort !== undefined &&
      !VALID_REASONING_EFFORTS.has(rawReasoningEffort)
    ) {
      return jsonResponse(
        { error: "reasoningEffort must be one of: low, medium, high" },
        400
      );
    }

    const message = (rawMessage || "").trim();
    const previousResponseId = rawPreviousResponseId?.trim();
    const instructions = rawInstructions?.trim();
    const model = rawModel?.trim();
    const reasoningEffort = rawReasoningEffort;

    let file:
      | {
          name: string;
          mimeType: string;
          base64Data: string;
        }
      | null = null;

    if (rawFile !== undefined) {
      if (!isObject(rawFile)) {
        return jsonResponse({ error: "file must be an object" }, 400);
      }

      const name = rawFile.name;
      const data = rawFile.data;
      const mimeType =
        typeof rawFile.mimeType === "string" ? rawFile.mimeType : "";

      if (typeof name !== "string" || !name.trim()) {
        return jsonResponse({ error: "file.name is required" }, 400);
      }
      if (typeof data !== "string" || !data.trim()) {
        return jsonResponse({ error: "file.data is required" }, 400);
      }

      const { base64Data, detectedMimeType } = parseDataField(data);
      const normalizedMimeType = (
        mimeType.trim() || detectedMimeType || "application/octet-stream"
      ).toLowerCase();

      const decodedBytes = estimateBase64DecodedBytes(base64Data);
      if (decodedBytes > MAX_FILE_SIZE_BYTES) {
        return jsonResponse(
          {
            error: `File too large. Maximum allowed size is ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB.`,
          },
          413
        );
      }

      file = {
        name: name.trim(),
        mimeType: normalizedMimeType,
        base64Data,
      };
    }

    if (!message && !file) {
      return jsonResponse({ error: "Either message or file is required" }, 400);
    }

    // -------------------------------------------------------
    // Step 3: Create the OpenAI client
    // -------------------------------------------------------
    // The OpenAI SDK works with Azure AI Foundry when you
    // point the baseURL to your Azure endpoint + "/openai/v1/".
    // This gives us the full power of the OpenAI SDK
    // (streaming, types, etc.) while hitting Azure's servers.
    const client = new OpenAI({
      baseURL: `${endpoint.replace(/\/+$/, "")}/openai/v1/`,
      apiKey: apiKey,
    });

    // -------------------------------------------------------
    // Step 4: Build the input payload
    // -------------------------------------------------------
    // The Responses API accepts either:
    //   - A simple string (just text)
    //   - An array of content parts (text + images/files)
    //
    // If the user attached a file (like an image), we build
    // a multi-part input. Otherwise, just send the string.

    let input: string | ResponseInput;
    const messageForModel = message || DEFAULT_FILE_ONLY_MESSAGE;

    if (file) {
      // Multi-part input: combine the file with the user's text.
      // The data comes as a base64 data URI from the frontend
      // (e.g., "data:image/png;base64,iVBOR...").
      // We strip the prefix to get raw base64 for the API.
      const base64Data = file.base64Data;

      // The API handles different file types differently:
      //   - Images: use "input_image" with a data URI
      //   - PDFs:   use "input_file" with base64 data
      //   - Text:   decode and include inline (API rejects text files via input_file)
      const isImage = file.mimeType.startsWith("image/");
      const isPdf = file.mimeType === "application/pdf";
      const fileDataUri = `data:${file.mimeType};base64,${base64Data}`;

      // All file types must be wrapped in a {role: "user", content: [...]} message.
      // The API expects input to be an array of message objects, not raw content items.
      if (isImage) {
        input = [
          {
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: fileDataUri,
              },
              { type: "input_text", text: messageForModel },
            ],
          },
        ] as ResponseInput;
      } else if (isPdf) {
        input = [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: file.name,
                file_data: fileDataUri,
              },
              { type: "input_text", text: messageForModel },
            ],
          },
        ] as ResponseInput;
      } else {
        // Text-based files: decode and include inline as text
        const fileContent = Buffer.from(base64Data, "base64").toString("utf-8");
        input = `[Attached file: ${file.name}]\n\n${fileContent}\n\n---\n\n${messageForModel}`;
      }
    } else {
      // Simple text-only input
      input = message;
    }

    // -------------------------------------------------------
    // Step 5: Determine model and reasoning settings
    // -------------------------------------------------------
    // Fall back to environment variables if the frontend
    // didn't specify these values.
    const modelName = model || process.env.MODEL_NAME || "gpt-5.2";
    const rawEffort = (
      reasoningEffort ||
      process.env.REASONING_EFFORT ||
      "low"
    ).toLowerCase();
    const effort: ReasoningEffort = VALID_REASONING_EFFORTS.has(
      rawEffort as ReasoningEffort
    )
      ? (rawEffort as ReasoningEffort)
      : "low";

    // Use provided instructions, fall back to env var, then default
    const systemInstructions =
      instructions ||
      process.env.CHATBOT_INSTRUCTIONS ||
      "You are a helpful assistant. Be concise and friendly.";

    // -------------------------------------------------------
    // Step 6: Call the Responses API with streaming
    // -------------------------------------------------------
    // This is the main API call. Key parameters:
    //
    //   model:                The deployment name in Azure
    //   input:                The user's message (string or array)
    //   instructions:         System prompt (personality/rules)
    //   previous_response_id: Links to prior turn for multi-turn chat
    //   reasoning:            Controls "thinking" depth
    //   stream:               Enables token-by-token streaming
    //
    const stream = await client.responses.create({
      model: modelName,
      input: input,
      instructions: systemInstructions,
      ...(previousResponseId && {
        previous_response_id: previousResponseId,
      }),
      reasoning: {
        effort,
      },
      stream: true,
    });

    // -------------------------------------------------------
    // Step 7: Convert the SDK stream to SSE for the frontend
    // -------------------------------------------------------
    // We create a ReadableStream that:
    //   1. Iterates over SDK stream events
    //   2. Extracts text deltas (partial tokens)
    //   3. Formats them as SSE messages
    //   4. Sends a final "done" event with the response ID
    //
    // The frontend reads this stream with fetch + getReader()
    // and updates the UI as each chunk arrives.

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // The SDK gives us an async iterable of events.
          // We only care about two event types:
          //   - "response.output_text.delta" = a text chunk
          //   - "response.completed" = the full response object
          let responseId = "";

          for await (const event of stream) {
            // --- Text Delta Event ---
            // Fired for each token/chunk of the response.
            // We forward it immediately so the user sees
            // the text appear progressively.
            if (event.type === "response.output_text.delta") {
              const sseMessage = `data: ${JSON.stringify({
                type: "delta",
                text: event.delta,
              })}\n\n`;
              controller.enqueue(encoder.encode(sseMessage));
            }

            // --- Response Completed Event ---
            // Fired once when the full response is ready.
            // We extract the response ID for conversation chaining.
            if (event.type === "response.completed") {
              responseId = event.response.id;
              // Extract token usage from the completed response
              const usage = event.response.usage;
              if (usage) {
                const usageMessage = `data: ${JSON.stringify({
                  type: "usage",
                  inputTokens: usage.input_tokens,
                  outputTokens: usage.output_tokens,
                  totalTokens: usage.total_tokens,
                })}\n\n`;
                controller.enqueue(encoder.encode(usageMessage));
              }
            }
          }

          // Send the "done" event so the frontend knows
          // the stream is complete and can store the responseId.
          const doneMessage = `data: ${JSON.stringify({
            type: "done",
            responseId: responseId,
          })}\n\n`;
          controller.enqueue(encoder.encode(doneMessage));

          // Close the stream
          controller.close();
        } catch (streamError) {
          // If something goes wrong during streaming,
          // send an error event before closing.
          console.error("Stream error:", streamError);

          const errorMessage = `data: ${JSON.stringify({
            type: "error",
            message:
              streamError instanceof Error
                ? streamError.message
                : "An error occurred during streaming",
          })}\n\n`;
          controller.enqueue(encoder.encode(errorMessage));
          controller.close();
        }
      },
    });

    // -------------------------------------------------------
    // Step 8: Return the SSE response
    // -------------------------------------------------------
    // These headers tell the browser:
    //   - Content-Type: text/event-stream = this is an SSE stream
    //   - Cache-Control: no-cache = don't cache the response
    //   - Connection: keep-alive = keep the connection open
    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    // -------------------------------------------------------
    // Global Error Handler
    // -------------------------------------------------------
    // Catches any unhandled errors (JSON parse failures,
    // network issues, SDK initialization errors, etc.)
    console.error("Chat API error:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      500
    );
  }
}
