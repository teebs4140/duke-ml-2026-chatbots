/**
 * Level 1: Terminal Chatbot with Azure AI Foundry
 * ================================================
 * This is the simplest possible AI chatbot -- a terminal conversation loop.
 * You type a message, the AI responds, and the conversation continues with
 * full memory of what was said before.
 *
 * Key concepts you'll learn:
 *   - Connecting to Azure AI Foundry using the OpenAI SDK
 *   - Sending messages with the Responses API
 *   - Multi-turn conversation using previous_response_id
 *   - Configuring model behavior with reasoning effort and instructions
 */

// --- Step 1: Import libraries ---
// We need four things:
//   - openai    : The official OpenAI Node SDK (works with Azure AI Foundry)
//   - dotenv    : Loads configuration from a .env file so we don't hard-code secrets
//   - readline  : Built-in Node module for reading terminal input line by line
//   - path      : Built-in Node module for constructing file paths
import OpenAI from "openai";
import * as dotenv from "dotenv";
import * as readline from "readline";
import * as path from "path";

// --- Step 2: Load environment variables ---
// The .env file lives at the project root (two levels up from this script).
// It contains your API key, endpoint URL, model name, and other settings.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Read each setting from the environment.
// The ?? operator provides a default if the variable isn't set.
const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;          // Your Azure endpoint URL
const API_KEY = process.env.AZURE_OPENAI_API_KEY;             // Your secret API key
const MODEL = process.env.MODEL_NAME ?? "gpt-5.2";            // Which model to use
const REASONING_EFFORT = process.env.REASONING_EFFORT ?? "low"; // low / medium / high
const INSTRUCTIONS =
    process.env.CHATBOT_INSTRUCTIONS ??
    "You are a helpful assistant. Be concise and friendly.";

// --- Step 3: Validate configuration ---
// If the .env file is missing or incomplete, we want a clear error -- not a
// confusing traceback buried deep in the SDK.
if (!ENDPOINT || !API_KEY) {
    console.error("ERROR: Missing configuration!");
    console.error("  Make sure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are set.");
    console.error("  Copy .env.example to .env and fill in your values.");
    process.exit(1);
}

// --- Step 4: Create the OpenAI client ---
// Azure AI Foundry exposes an OpenAI-compatible API. We point the standard
// OpenAI client at it by setting baseURL to your endpoint.
// This means you can use the exact same SDK you'd use with OpenAI directly.
const client = new OpenAI({
    baseURL: ENDPOINT,
    apiKey: API_KEY,
    maxRetries: 10,
    defaultQuery: { "api-version": "2025-04-01-preview" },
});

// --- Step 5: Print a welcome banner ---
// A friendly banner so the user knows the chatbot is ready and how to use it.
console.log("=".repeat(50));
console.log("  Level 1: Terminal Chatbot");
console.log("=".repeat(50));
console.log(`  Model   : ${MODEL}`);
console.log(`  Effort  : ${REASONING_EFFORT}`);
console.log("-".repeat(50));
console.log("  Type a message and press Enter to chat.");
console.log('  Type "clear" to reset the conversation.');
console.log('  Type "quit" or "exit" to leave.');
console.log("=".repeat(50));
console.log();

// --- Step 6: Run the conversation loop ---
// previous_response_id is the secret to multi-turn conversation. The API
// remembers the full conversation history on the server side -- we just pass
// back the ID of the last response so the API knows which conversation to
// continue. Setting it to null starts a brand-new conversation.
let previousResponseId: string | null = null;

// Create a readline interface for terminal input/output.
// This is Node's way of reading user input line by line.
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// prompt() displays "You: " and waits for the user to type something.
function prompt(): void {
    rl.question("You: ", async (userInput: string) => {
        userInput = userInput.trim();

        // 6a. Skip empty input
        if (!userInput) {
            prompt();
            return;
        }

        // 6b. Check for special commands
        if (userInput.toLowerCase() === "quit" || userInput.toLowerCase() === "exit") {
            console.log("Goodbye!");
            rl.close();
            return;
        }

        if (userInput.toLowerCase() === "clear") {
            // Reset the conversation by clearing the previous response ID.
            // The next message will start a fresh conversation with no history.
            previousResponseId = null;
            console.log("Conversation cleared. Starting fresh!\n");
            prompt();
            return;
        }

        // 6c. Send the message to the API
        try {
            const response = await client.responses.create({
                model: MODEL,                                     // Which model to use
                input: userInput,                                 // The user's message
                instructions: INSTRUCTIONS,                       // System-level instructions
                reasoning: { effort: REASONING_EFFORT as "low" | "medium" | "high" },
                previous_response_id: previousResponseId ?? undefined,  // Conversation continuity
            });

            // 6d. Print the response and save the ID for next turn
            console.log(`\nAssistant: ${response.output_text}`);

            // 6e. Show token usage so you can track context consumption
            if (response.usage) {
                console.log(`  [tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out, ${response.usage.total_tokens} total]`);
            }
            console.log();

            previousResponseId = response.id;
        } catch (error) {
            // If something goes wrong, print the error but keep the loop running
            // so the user can try again or fix the issue.
            console.error(`\nError: ${error}\n`);
        }

        // Ask for the next message
        prompt();
    });
}

// Start the conversation loop
prompt();
