/**
 * Level 2 - Terminal Chatbot with File Upload (TypeScript)
 * ========================================================
 * Extends Level 1 with the ability to attach files (PDFs, images, text, etc.)
 * and send them to the AI alongside your messages.
 *
 * New concepts:
 *   - Base64 encoding (converting binary files to text for the API)
 *   - MIME types (telling the API what kind of file you're sending)
 *   - Multimodal input (mixing text and files in one message)
 *
 * Usage:
 *   npx ts-node chat.ts
 *
 * Commands:
 *   /upload <path>  Attach a file to your next message
 *   /files          Show currently attached files
 *   /clear          Clear conversation history AND attached files
 *   /help           Show available commands
 *   /quit           Exit the chatbot
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import OpenAI from "openai";
import * as dotenv from "dotenv";

// ========================================
// Load Environment Variables
// ========================================
// Walk up two directories from this file to find the project root's .env
//   level-2-files/typescript/chat.ts -> duke-ml-chatbot/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ========================================
// Configuration (same as Level 1)
// ========================================
// Read settings from environment variables (see .env.example for details)
const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;           // Your Azure AI Foundry URL
const API_KEY = process.env.AZURE_OPENAI_API_KEY;             // Your API key
const MODEL = process.env.MODEL_NAME || "gpt-5.2";            // Which model to use
const REASONING_EFFORT = process.env.REASONING_EFFORT || "low"; // low / medium / high
const INSTRUCTIONS =
  process.env.CHATBOT_INSTRUCTIONS ||
  "You are a helpful assistant. Be concise and friendly.";

if (!ENDPOINT || !API_KEY) {
  console.error("ERROR: Missing configuration!");
  console.error("  Looked for .env at:", path.resolve(__dirname, "../../.env"));
  console.error(
    "  Make sure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are set."
  );
  console.error("  Copy .env.example to .env and fill in your values.");
  process.exit(1);
}

// ========================================
// Create the OpenAI Client (same as Level 1)
// ========================================
// We use the generic OpenAI client pointed at the Azure endpoint.
const client = new OpenAI({
  baseURL: ENDPOINT,
  apiKey: API_KEY,
  maxRetries: 10,
});

// --- NEW IN LEVEL 2 ---
// ========================================
// MIME Type Map
// ========================================
// A small lookup table for common file extensions.
// In production, you might use a library like "mime-types" instead.
const MIME_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".csv": "text/csv",
  ".json": "application/json",
  ".md": "text/markdown",
  ".html": "text/html",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

// ========================================
// File type detection
// ========================================
// The API handles different file types differently:
//   - PDFs:   use "input_file" with base64 data
//   - Images: use "input_image" with a data URI
//   - Text:   read the content and include it inline as text
//             (the API doesn't accept .txt/.csv/etc. via input_file)
const TEXT_EXTENSIONS = new Set([
  ".txt", ".csv", ".md", ".json", ".py", ".js", ".ts", ".html", ".css",
  ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".log", ".sh", ".r", ".sas",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function isTextFile(filename: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

// ========================================
// Type for an Attached File
// ========================================
interface AttachedFile {
  filePath: string;   // Original path (for reading at send time)
  filename: string;
  mimeType: string;
}

// ========================================
// File Encoding Helper
// ========================================
/**
 * Read a file from disk and return its base64-encoded content.
 */
function encodeFileBase64(filePath: string): string {
  return fs.readFileSync(filePath).toString("base64");
}

/**
 * Read a text file and return its content as a string.
 */
function readTextFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}
// --- END NEW ---

// ========================================
// Chat Loop
// ========================================
async function main(): Promise<void> {
  console.log("=".repeat(50));
  console.log("  Level 2 - Chat with File Upload");
  console.log("=".repeat(50));
  console.log(`  Model:   ${MODEL}`);
  console.log(`  Effort:  ${REASONING_EFFORT}`);
  console.log();
  console.log("  Commands:");
  console.log("    /upload <path>  Attach a file");
  console.log("    /files          Show attached files");
  console.log("    /clear          Clear history & files");
  console.log("    /help           Show commands");
  console.log("    /quit           Exit");
  console.log("=".repeat(50));
  console.log();

  // Set up line-by-line input from the terminal
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Helper to prompt the user and wait for their answer
  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  // Conversation state
  let previousResponseId: string | null = null; // Links messages into a conversation

  // --- NEW IN LEVEL 2 ---
  // List of attached files waiting to be sent
  const attachedFiles: AttachedFile[] = [];
  // --- END NEW ---

  // Main loop
  while (true) {
    const userInput = (await ask("You: ")).trim();

    if (!userInput) continue;

    // ----------------------------------------
    // Handle slash commands
    // ----------------------------------------
    if (userInput.toLowerCase() === "/quit") {
      console.log("Goodbye!");
      break;
    }

    if (userInput.toLowerCase() === "/help") {
      console.log("\n  /upload <path>  Attach a file to your next message");
      console.log("  /files          Show currently attached files");
      console.log("  /clear          Clear conversation history and files");
      console.log("  /help           Show this help message");
      console.log("  /quit           Exit the chatbot\n");
      continue;
    }

    if (userInput.toLowerCase() === "/clear") {
      previousResponseId = null;
      // --- NEW IN LEVEL 2 ---
      attachedFiles.length = 0; // Also clear any attached files
      // --- END NEW ---
      console.log("  Conversation and files cleared.\n");
      continue;
    }

    // --- NEW IN LEVEL 2 ---
    if (userInput.toLowerCase() === "/files") {
      if (attachedFiles.length === 0) {
        console.log("  No files attached.\n");
      } else {
        console.log(`  ${attachedFiles.length} file(s) attached:`);
        for (const f of attachedFiles) {
          console.log(`    - ${f.filename} (${f.mimeType})`);
        }
        console.log();
      }
      continue;
    }

    if (userInput.toLowerCase().startsWith("/upload")) {
      // Parse the file path from the command
      const filePath = userInput.replace(/^\/upload\s+/, "").trim();
      if (!filePath) {
        console.log("  Usage: /upload <file-path>\n");
        continue;
      }

      // Validate the file exists
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        console.log(`  File not found: ${filePath}\n`);
        continue;
      }

      // Store the file info (we encode at send time)
      try {
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || "application/octet-stream";
        const filename = path.basename(filePath);
        attachedFiles.push({ filePath, filename, mimeType });
        console.log(`  Attached: ${filename} (${mimeType})`);
        console.log(`  Total files: ${attachedFiles.length}\n`);
      } catch (e) {
        console.log(`  Error reading file: ${e}\n`);
      }
      continue;
    }
    // --- END NEW ---

    // ----------------------------------------
    // Send message to the AI
    // ----------------------------------------
    try {
      let response;

      // --- NEW IN LEVEL 2 ---
      // If files are attached, build a multimodal input array
      // that combines file data and text in one message.
      //
      // The API handles different file types differently:
      //   - PDFs:   use "input_file" with base64 data
      //   - Images: use "input_image" with a data URI
      //   - Text:   read the content and include it inline as text
      //             (the API doesn't accept .txt/.csv/etc. via input_file)
      if (attachedFiles.length > 0) {
        // Build the content array with proper types.
        // We use `any[]` here because the SDK's union types are complex
        // and we're building content dynamically based on file type.
        const content: any[] = [];
        for (const f of attachedFiles) {
          if (isImageFile(f.filename)) {
            // Images use input_image with a data URI
            const b64 = encodeFileBase64(f.filePath);
            content.push({
              type: "input_image",
              image_url: `data:${f.mimeType};base64,${b64}`,
            });
          } else if (isTextFile(f.filename)) {
            // Text files: read content and include it directly
            const textContent = readTextFile(f.filePath);
            content.push({
              type: "input_text",
              text: `[Attached file: ${f.filename}]\n\n${textContent}`,
            });
          } else {
            // PDFs and other binary files: use input_file with base64
            const b64 = encodeFileBase64(f.filePath);
            content.push({
              type: "input_file",
              filename: f.filename,
              file_data: `data:${f.mimeType};base64,${b64}`,
            });
          }
        }
        // The user's text message comes last
        content.push({ type: "input_text", text: userInput });

        // Send the multimodal message
        response = await client.responses.create({
          model: MODEL,
          input: [{ role: "user" as const, content }],
          instructions: INSTRUCTIONS,
          reasoning: { effort: REASONING_EFFORT as "low" | "medium" | "high" },
          previous_response_id: previousResponseId ?? undefined,
        });

        // Clear attached files after sending (they've been included)
        console.log(
          `  (Sent ${attachedFiles.length} file(s) with your message)`
        );
        attachedFiles.length = 0;
      } else {
        // No files attached - simple text input (same as Level 1)
        response = await client.responses.create({
          model: MODEL,
          input: userInput,
          instructions: INSTRUCTIONS,
          reasoning: { effort: REASONING_EFFORT as "low" | "medium" | "high" },
          previous_response_id: previousResponseId ?? undefined,
        });
      }
      // --- END NEW ---

      // Save the response ID so the next message continues the conversation
      previousResponseId = response.id;

      // Print the assistant's reply
      console.log(`\nAssistant: ${response.output_text}`);

      // Show token usage so you can track context consumption
      if (response.usage) {
        console.log(`  [tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out, ${response.usage.total_tokens} total]`);
      }
      console.log();
    } catch (e) {
      console.log(`\n  Error: ${e}\n`);
    }
  }

  rl.close();
}

main();
