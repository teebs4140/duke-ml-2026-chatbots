"""
Level 1B: Gradio Chatbot with Streaming
========================================
This builds on Level 1's Gradio chatbot by adding streaming -- tokens appear
one by one as the AI generates them, creating a natural typing effect.

What's new compared to Level 1:
  - stream=True in the API call
  - A generator function that yields partial text as tokens arrive
  - Gradio renders each yield as an update to the chat display
"""

# --- Step 1: Import libraries ---
# Same as Level 1 -- no new imports needed for streaming!
import os
from pathlib import Path

import gradio as gr
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
client = OpenAI(
    base_url=ENDPOINT,
    api_key=API_KEY,
    max_retries=10,
)


# --- Step 5: Streaming chat handler ---
# The only difference from Level 1: stream=True and a generator that yields
# partial text. Gradio re-renders the chat display on each yield.

def respond(message, _history, prev_id):
    """Process a user message and stream the AI response.

    Args:
        message:   the user's text (str, from gr.ChatInterface)
        _history:  chat history (managed by Gradio, unused -- we chain via prev_id)
        prev_id:   previous_response_id for conversation chaining (gr.State)

    Yields:
        (partial_response, prev_id) as the response streams in.
    """
    if not message.strip():
        yield "", prev_id
        return

    try:
        # --- NEW: stream=True ---
        stream = client.responses.create(
            model=MODEL,
            input=message,
            instructions=INSTRUCTIONS,
            reasoning={"effort": REASONING_EFFORT},
            previous_response_id=prev_id,
            stream=True,  # <-- This is the key change!
        )

        # --- NEW: Iterate over events and yield partial text ---
        # Each yield updates the chat display in real-time.
        partial = ""
        for event in stream:
            if event.type == "response.output_text.delta":
                partial += event.delta
                yield partial, prev_id
            elif event.type == "response.completed":
                prev_id = event.response.id
                yield partial, prev_id

    except Exception as e:
        yield f"Error: {e}", prev_id


# --- Step 6: Build the Gradio UI ---
# Same as Level 1 -- gr.ChatInterface handles everything.
# Because respond() is a generator, Gradio automatically streams the output.

prev_response_id = gr.State(None)

demo = gr.ChatInterface(
    fn=respond,
    title="Level 1B: Gradio Chatbot (Streaming)",
    description=f"Model: **{MODEL}** · Reasoning: **{REASONING_EFFORT}**",
    additional_inputs=[prev_response_id],
    additional_inputs_accordion=gr.Accordion(visible=False),
    additional_outputs=[prev_response_id],
)


# --- Step 7: Launch the app ---
# share=True creates a public *.gradio.live URL that works even inside
# JupyterHub containers (bypasses the nginx proxy).
if __name__ == "__main__":
    print(f"\n  Model   : {MODEL}")
    print(f"  Effort  : {REASONING_EFFORT}")
    print()
    demo.launch(share=True)
