/**
 * Level 1B: Terminal Chatbot with Streaming
 * ==========================================
 * This builds on Level 1 by adding streaming -- instead of waiting for the
 * full response, tokens appear one by one as the AI generates them.
 * This creates a natural "typing" effect.
 *
 * What's new compared to Level 1:
 *   - stream: true in the API call
 *   - Async iteration over the event stream
 *   - Two event types: "response.output_text.delta" and "response.completed"
 */

// --- Step 1: Import libraries ---
// Same as Level 1 -- no new imports needed for streaming!
import OpenAI from "openai";
import * as dotenv from "dotenv";
import * as readline from "readline";
import * as path from "path";

// --- Step 2: Load environment variables ---
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const API_KEY = process.env.AZURE_OPENAI_API_KEY;
const MODEL = process.env.MODEL_NAME ?? "gpt-5.2";
const REASONING_EFFORT = process.env.REASONING_EFFORT ?? "low";
const INSTRUCTIONS =
    process.env.CHATBOT_INSTRUCTIONS ??
    "You are a helpful assistant. Be concise and friendly.";

// --- Step 3: Validate configuration ---
if (!ENDPOINT || !API_KEY) {
    console.error("ERROR: Missing configuration!");
    console.error("  Make sure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are set.");
    console.error("  Copy .env.example to .env and fill in your values.");
    process.exit(1);
}

// --- Step 4: Create the OpenAI client ---
const client = new OpenAI({
    baseURL: ENDPOINT,
    apiKey: API_KEY,
    maxRetries: 10,
});

// --- Step 5: Print a welcome banner ---
console.log("=".repeat(50));
console.log("  Level 1B: Terminal Chatbot (Streaming)");
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
let previousResponseId: string | null = null;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function prompt(): void {
    rl.question("You: ", async (userInput: string) => {
        userInput = userInput.trim();

        if (!userInput) {
            prompt();
            return;
        }

        if (userInput.toLowerCase() === "quit" || userInput.toLowerCase() === "exit") {
            console.log("Goodbye!");
            rl.close();
            return;
        }

        if (userInput.toLowerCase() === "clear") {
            previousResponseId = null;
            console.log("Conversation cleared. Starting fresh!\n");
            prompt();
            return;
        }

        // --- NEW: Streaming API call ---
        // The only difference from Level 1 is stream: true. Instead of
        // getting back a complete response, we get an async iterable of events.
        try {
            const stream = await client.responses.create({
                model: MODEL,
                input: userInput,
                instructions: INSTRUCTIONS,
                reasoning: { effort: REASONING_EFFORT as "low" | "medium" | "high" },
                previous_response_id: previousResponseId ?? undefined,
                stream: true,  // <-- This is the key change!
            });

            // --- NEW: Read the event stream ---
            // We use "for await" to iterate over events as they arrive.
            //
            //   "response.output_text.delta"  -- A chunk of text just arrived.
            //     We use process.stdout.write() instead of console.log() so
            //     text appears on the same line without a trailing newline.
            //
            //   "response.completed"  -- The full response is done.
            //     We grab the response ID for conversation chaining.
            //
            process.stdout.write("\nAssistant: ");
            for await (const event of stream) {
                if (event.type === "response.output_text.delta") {
                    process.stdout.write(event.delta);
                } else if (event.type === "response.completed") {
                    previousResponseId = event.response.id;
                    // Show token usage after the stream finishes
                    const usage = event.response.usage;
                    if (usage) {
                        console.log(`\n  [tokens: ${usage.input_tokens} in, ${usage.output_tokens} out, ${usage.total_tokens} total]`);
                    }
                }
            }
            console.log();  // Blank line after the response finishes

        } catch (error) {
            console.error(`\nError: ${error}\n`);
        }

        prompt();
    });
}

// Start the conversation loop
prompt();
