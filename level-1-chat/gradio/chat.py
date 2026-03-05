"""
Level 1: Gradio Chatbot with Azure AI Foundry
===============================================
The simplest possible web chatbot -- a Gradio chat interface (no streaming).
This is the browser-based equivalent of level-1-chat/python/chat.py.

Key concepts you'll learn:
  - Building a minimal chat UI with gr.ChatInterface
  - Sending a message and displaying the full response
  - Multi-turn conversation using previous_response_id and gr.State
"""

# --- Step 1: Import libraries ---
# gradio  : Builds web UIs with minimal code
# openai  : Official SDK -- works with Azure AI Foundry via base_url
# dotenv  : Loads secrets from .env so we don't hard-code them
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
# Azure AI Foundry exposes an OpenAI-compatible API. We point the standard
# OpenAI client at it by setting base_url to your endpoint.
client = OpenAI(
    base_url=ENDPOINT,
    api_key=API_KEY,
    max_retries=10,
)


# --- Step 5: Chat handler ---
# gr.State holds the previous_response_id for conversation chaining.

def respond(message, _history, prev_id):
    """Process a user message and return the AI response.

    Args:
        message:   the user's text (str, from gr.ChatInterface)
        _history:  chat history (managed by Gradio, unused -- we chain via prev_id)
        prev_id:   previous_response_id for conversation chaining (gr.State)

    Returns:
        (response_text, prev_id) tuple.
    """
    if not message.strip():
        return "", prev_id

    try:
        response = client.responses.create(
            model=MODEL,
            input=message,
            instructions=INSTRUCTIONS,
            reasoning={"effort": REASONING_EFFORT},
            previous_response_id=prev_id,
        )

        return response.output_text, response.id

    except Exception as e:
        return f"Error: {e}", prev_id


# --- Step 6: Build the Gradio UI ---
# gr.ChatInterface handles the chat display, text input, and history
# automatically. We just provide the respond() function.

prev_response_id = gr.State(None)

demo = gr.ChatInterface(
    fn=respond,
    title="Level 1: Gradio Chatbot",
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
