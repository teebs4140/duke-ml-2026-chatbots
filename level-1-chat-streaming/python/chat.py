"""
Level 1B: Terminal Chatbot with Streaming
==========================================
This builds on Level 1 by adding streaming -- instead of waiting for the
full response, tokens appear one by one as the AI generates them.
This creates a natural "typing" effect.

What's new compared to Level 1:
  - stream=True in the API call
  - Iterating over the event stream
  - Two event types: "response.output_text.delta" and "response.completed"
"""

# --- Step 1: Import libraries ---
# Same as Level 1 -- no new imports needed for streaming!
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# --- Step 2: Load environment variables ---
# The .env file lives at the project root (two levels up from this script).
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(env_path)

ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
MODEL = os.getenv("MODEL_NAME", "gpt-5.2")
REASONING_EFFORT = os.getenv("REASONING_EFFORT", "low")
INSTRUCTIONS = os.getenv(
    "CHATBOT_INSTRUCTIONS",
    "You are a helpful assistant. Be concise and friendly.",
)

# --- Step 3: Validate configuration ---
if not ENDPOINT or not API_KEY:
    print("ERROR: Missing configuration!")
    print(f"  Looked for .env at: {env_path}")
    print("  Make sure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are set.")
    print("  Copy .env.example to .env and fill in your values.")
    raise SystemExit(1)

# --- Step 4: Create the OpenAI client ---
# Same as Level 1 -- point the OpenAI SDK at your Azure endpoint.
client = OpenAI(
    base_url=ENDPOINT,
    api_key=API_KEY,
    max_retries=10,
)

# --- Step 5: Print a welcome banner ---
print("=" * 50)
print("  Level 1B: Terminal Chatbot (Streaming)")
print("=" * 50)
print(f"  Model   : {MODEL}")
print(f"  Effort  : {REASONING_EFFORT}")
print("-" * 50)
print("  Type a message and press Enter to chat.")
print('  Type "clear" to reset the conversation.')
print('  Type "quit" or "exit" to leave.')
print("=" * 50)
print()

# --- Step 6: Run the conversation loop ---
previous_response_id = None

while True:
    try:
        user_input = input("You: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\nGoodbye!")
        break

    if not user_input:
        continue

    if user_input.lower() in ("quit", "exit"):
        print("Goodbye!")
        break

    if user_input.lower() == "clear":
        previous_response_id = None
        print("Conversation cleared. Starting fresh!\n")
        continue

    # --- NEW: Streaming API call ---
    # The only difference from Level 1 is stream=True. Instead of getting
    # back a complete response object, we get an iterable of events.
    try:
        stream = client.responses.create(
            model=MODEL,
            input=user_input,
            instructions=INSTRUCTIONS,
            reasoning={"effort": REASONING_EFFORT},
            previous_response_id=previous_response_id,
            stream=True,  # <-- This is the key change!
        )

        # --- NEW: Read the event stream ---
        # The stream yields events as they happen. We care about two types:
        #
        #   "response.output_text.delta"  -- A chunk of text just arrived.
        #     event.delta contains the new text (could be a word, part of a
        #     word, or punctuation). We print it immediately with end=""
        #     so it appears on the same line, and flush=True so it shows
        #     up right away instead of waiting for a newline.
        #
        #   "response.completed"  -- The full response is done.
        #     event.response.id gives us the ID to chain the next turn.
        #
        print("\nAssistant: ", end="", flush=True)
        for event in stream:
            if event.type == "response.output_text.delta":
                print(event.delta, end="", flush=True)
            elif event.type == "response.completed":
                previous_response_id = event.response.id
                # Show token usage after the stream finishes
                usage = event.response.usage
                if usage:
                    print(f"\n  [tokens: {usage.input_tokens} in, {usage.output_tokens} out, {usage.total_tokens} total]")
        print()  # Blank line after the response finishes

    except Exception as e:
        print(f"\nError: {e}\n")
