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
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || "").trim();
const API_KEY = (process.env.AZURE_OPENAI_API_KEY || "").trim();
const DEFAULT_MODEL = (process.env.MODEL_NAME || "gpt-5.2").trim() || "gpt-5.2";

const rawDefaultEffort = (process.env.REASONING_EFFORT || "low")
  .trim()
  .toLowerCase();
const DEFAULT_REASONING_EFFORT: ReasoningEffort = VALID_REASONING_EFFORTS.has(
  rawDefaultEffort as ReasoningEffort
)
  ? (rawDefaultEffort as ReasoningEffort)
  : "low";

const DEFAULT_INSTRUCTIONS =
  (process.env.CHATBOT_INSTRUCTIONS ||
    "You are a helpful assistant. Be concise and friendly.")
    .trim() || "You are a helpful assistant. Be concise and friendly.";

const client =
  ENDPOINT && API_KEY
    ? new OpenAI({
        baseURL: ENDPOINT,
        apiKey: API_KEY,
        maxRetries: 10,
        defaultQuery: { "api-version": "2025-04-01-preview" },
      })
    : null;

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
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
    // Step 1: Validate environment variables
    // -------------------------------------------------------
    if (!client) {
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

    const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
    const previousResponseId =
      typeof rawPreviousResponseId === "string"
        ? rawPreviousResponseId.trim() || undefined
        : undefined;
    const instructions =
      typeof rawInstructions === "string" ? rawInstructions.trim() : "";
    const model = typeof rawModel === "string" ? rawModel.trim() : "";

    if (rawMessage !== undefined && typeof rawMessage !== "string") {
      return jsonResponse({ error: "message must be a string" }, 400);
    }
    if (
      rawPreviousResponseId !== undefined &&
      typeof rawPreviousResponseId !== "string"
    ) {
      return jsonResponse({ error: "previousResponseId must be a string" }, 400);
    }
    if (rawInstructions !== undefined && typeof rawInstructions !== "string") {
      return jsonResponse({ error: "instructions must be a string" }, 400);
    }
    if (rawModel !== undefined && typeof rawModel !== "string") {
      return jsonResponse({ error: "model must be a string" }, 400);
    }

    let effort = DEFAULT_REASONING_EFFORT;
    if (rawReasoningEffort !== undefined) {
      const normalizedEffort =
        typeof rawReasoningEffort === "string"
          ? rawReasoningEffort.trim().toLowerCase()
          : "";

      if (!VALID_REASONING_EFFORTS.has(normalizedEffort as ReasoningEffort)) {
        return jsonResponse(
          { error: "reasoningEffort must be one of: low, medium, high" },
          400
        );
      }

      effort = normalizedEffort as ReasoningEffort;
    }

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
    // Step 3: Build the input payload
    // -------------------------------------------------------
    let input: string | ResponseInput;
    const messageForModel = message || DEFAULT_FILE_ONLY_MESSAGE;

    if (file) {
      const base64Data = file.base64Data;

      const isImage = file.mimeType.startsWith("image/");
      const isPdf = file.mimeType === "application/pdf";
      const fileDataUri = `data:${file.mimeType};base64,${base64Data}`;

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
        const fileContent = Buffer.from(base64Data, "base64").toString("utf-8");
        input = `[Attached file: ${file.name}]\n\n${fileContent}\n\n---\n\n${messageForModel}`;
      }
    } else {
      input = message;
    }

    // -------------------------------------------------------
    // Step 4: Determine model and instructions
    // -------------------------------------------------------
    const modelName = model || DEFAULT_MODEL;
    const systemInstructions = instructions || DEFAULT_INSTRUCTIONS;

    // -------------------------------------------------------
    // Step 5: Call the Responses API with streaming
    // -------------------------------------------------------
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
    // Step 6: Convert the SDK stream to SSE for the frontend
    // -------------------------------------------------------
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          let responseId = "";

          for await (const event of stream) {
            if (event.type === "response.output_text.delta") {
              const sseMessage = `data: ${JSON.stringify({
                type: "delta",
                text: event.delta,
              })}\n\n`;
              controller.enqueue(encoder.encode(sseMessage));
            }

            if (event.type === "response.completed") {
              responseId = event.response.id;
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

          const doneMessage = `data: ${JSON.stringify({
            type: "done",
            responseId: responseId,
          })}\n\n`;
          controller.enqueue(encoder.encode(doneMessage));
          controller.close();
        } catch (streamError) {
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
    // Step 7: Return the SSE response
    // -------------------------------------------------------
    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
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
