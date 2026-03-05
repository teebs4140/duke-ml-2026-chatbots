"""
Level 3: Gradio Web Chat with Azure AI Foundry
================================================
A browser-based chat UI built with Gradio. This is the recommended way to
run a web chatbot inside a JupyterHub container, because Gradio's share=True
generates a public URL that bypasses JupyterHub's nginx proxy.

Key concepts you'll learn:
  - Building a chat UI with Gradio components (Chatbot, MultimodalTextbox)
  - Streaming AI responses token-by-token via a Python generator
  - Handling file uploads (images, PDFs, text) for multimodal input
  - Using gr.State to chain multi-turn conversations with previous_response_id

How it works:
  1. User types a message (optionally attaches a file) in the MultimodalTextbox
  2. The message is added to the chat history and sent to Azure AI Foundry
  3. Tokens stream back via client.responses.create(stream=True)
  4. The generator yields updated history after each token, creating a typing effect
  5. The response ID is saved in gr.State for conversation chaining
"""

# --- Step 1: Import libraries ---
# gradio       : Python library that builds web UIs with minimal code
# openai       : Official SDK -- works with Azure AI Foundry via base_url
# dotenv       : Loads secrets from .env so we don't hard-code them
# base64       : Encode files for the API
# mimetypes    : Detect file types from extensions
import base64
import mimetypes
import os
from pathlib import Path

import gradio as gr
from dotenv import load_dotenv
from openai import OpenAI

# --- Step 2: Load environment variables ---
# The .env file lives at the project root (three levels up from this script).
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
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
DEFAULT_FILE_ONLY_MESSAGE = "Please analyze the attached file."

# --- Step 3: Validate and create the OpenAI client ---
if not ENDPOINT or not API_KEY:
    print("ERROR: Missing configuration!")
    print(f"  Looked for .env at: {env_path}")
    print("  Make sure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are set.")
    print("  Copy .env.example to .env and fill in your values.")
    raise SystemExit(1)

client = OpenAI(
    base_url=ENDPOINT,
    api_key=API_KEY,
    max_retries=10,
)


# --- Step 4: File handling helpers ---
# Gradio gives us file paths (not base64 like the Flask version).
# We read the file from disk and format it for the API.
def validate_file_size(file_path: str) -> None:
    """Reject files that exceed the server-side upload limit."""
    file_size = os.path.getsize(file_path)
    if file_size > MAX_FILE_SIZE_BYTES:
        max_size_mb = MAX_FILE_SIZE_BYTES // (1024 * 1024)
        raise ValueError(f"File too large. Maximum allowed size is {max_size_mb} MB.")


def encode_file_for_api(file_path: str) -> tuple[str, str]:
    """Read a file and return (base64_data, mime_type)."""
    validate_file_size(file_path)
    mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    with open(file_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    return data, mime_type


def build_api_input(message: str, file_path: str | None) -> str | list:
    """Build the API input, handling text-only and multimodal messages.

    The API handles different file types differently:
      - Images: use "input_image" with a data URI
      - PDFs:   use "input_file" with base64 data URI
      - Text:   decode and include inline (API rejects text files via input_file)
    """
    if not file_path:
        return message

    b64_data, mime_type = encode_file_for_api(file_path)
    data_uri = f"data:{mime_type};base64,{b64_data}"
    text = message or DEFAULT_FILE_ONLY_MESSAGE
    filename = os.path.basename(file_path)

    if mime_type.startswith("image/"):
        return [
            {
                "role": "user",
                "content": [
                    {"type": "input_image", "image_url": data_uri},
                    {"type": "input_text", "text": text},
                ],
            }
        ]
    elif mime_type == "application/pdf":
        return [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_file",
                        "filename": filename,
                        "file_data": data_uri,
                    },
                    {"type": "input_text", "text": text},
                ],
            }
        ]
    else:
        # Text-based files: read content and include inline
        try:
            with open(file_path, "r", errors="replace") as f:
                text_content = f.read()
        except Exception:
            text_content = "(Could not read file as text)"
        return f"[Attached file: {filename}]\n\n{text_content}\n\n---\n\n{text}"


# --- Step 5: Chat handler ---
# This is the core function. It's a generator that:
#   1. Adds the user message to history
#   2. Calls the API with stream=True
#   3. Yields updated history after each token (creating the typing effect)
#   4. Saves the response ID for conversation chaining

def respond(message, history, prev_id, instructions, model, reasoning_effort):
    """Process a user message and stream the AI response.

    Args:
        message:  dict with "text" and "files" keys (from MultimodalTextbox)
        history:  list of {"role": ..., "content": ...} dicts
        prev_id:  previous_response_id for conversation chaining (gr.State)
        instructions:  system prompt
        model:    model name
        reasoning_effort:  "low", "medium", or "high"

    Yields:
        (history, prev_id) tuples as the response streams in.
    """
    # Extract text and file from the multimodal input
    user_text = message.get("text", "").strip()
    files = message.get("files", [])
    file_path = files[0] if files else None

    # Skip empty messages
    if not user_text and not file_path:
        yield history, prev_id
        return

    # Add the user message to chat history for display
    if file_path:
        # Show the file in the chat, then the text (if any)
        history.append({"role": "user", "content": {"path": file_path}})
        if user_text:
            history.append({"role": "user", "content": user_text})
    else:
        history.append({"role": "user", "content": user_text})

    # Build the API input (handles text-only and multimodal)
    try:
        api_input = build_api_input(user_text, file_path)
    except (OSError, ValueError) as e:
        history.append({"role": "assistant", "content": f"Error: {e}"})
        yield history, prev_id
        return

    # Add an empty assistant message that we'll fill in as tokens stream
    history.append({"role": "assistant", "content": ""})

    try:
        # Call the API with streaming enabled
        create_params = {
            "model": model,
            "input": api_input,
            "instructions": instructions,
            "reasoning": {"effort": reasoning_effort},
            "stream": True,
        }
        if prev_id:
            create_params["previous_response_id"] = prev_id

        stream = client.responses.create(**create_params)

        # Iterate over stream events and update the chat display in real-time
        for event in stream:
            if event.type == "response.output_text.delta":
                # Append each text chunk to the assistant's message
                history[-1]["content"] += event.delta
                yield history, prev_id

            elif event.type == "response.completed":
                # Save the response ID for conversation chaining
                prev_id = event.response.id

                # Show token usage
                usage = event.response.usage
                if usage:
                    usage_text = (
                        f"\n\n---\n*Tokens: {usage.input_tokens} in, "
                        f"{usage.output_tokens} out, "
                        f"{usage.total_tokens} total*"
                    )
                    history[-1]["content"] += usage_text

                yield history, prev_id

    except Exception as e:
        history[-1]["content"] = f"Error: {e}"
        yield history, prev_id


def clear_conversation():
    """Reset the chat history and previous_response_id."""
    return [], None


# --- Step 6: Build the Gradio UI ---
# We use gr.Blocks for full control over the layout. The UI has:
#   - A chatbot display area
#   - A multimodal textbox for text + file input
#   - An accordion with settings (model, reasoning effort, instructions)
#   - A clear button to reset the conversation

with gr.Blocks(
    title="Level 3: Gradio Chatbot",
    fill_height=True,
) as demo:
    gr.Markdown("## Level 3: Gradio Chatbot")
    gr.Markdown(
        f"Model: **{MODEL}** · Reasoning: **{REASONING_EFFORT}** · "
        "Type a message or upload a file to chat."
    )

    # State to store the previous response ID (invisible, per-session)
    prev_response_id = gr.State(None)

    # The chat display
    chatbot = gr.Chatbot(
        height=500,
        placeholder="Send a message to start chatting...",
    )

    # Multimodal input: text + file upload in one component
    chat_input = gr.MultimodalTextbox(
        placeholder="Type a message or attach a file...",
        show_label=False,
        file_types=["image", ".pdf", ".txt", ".csv", ".json", ".py", ".md"],
        sources=["upload"],
    )

    # Settings in a collapsible accordion
    with gr.Accordion("Settings", open=False):
        instructions_input = gr.Textbox(
            value=INSTRUCTIONS,
            label="System Instructions",
            lines=2,
        )
        model_input = gr.Textbox(
            value=MODEL,
            label="Model",
        )
        effort_input = gr.Dropdown(
            choices=["low", "medium", "high"],
            value=REASONING_EFFORT,
            label="Reasoning Effort",
        )

    # Clear button
    clear_btn = gr.Button("Clear Conversation")

    # --- Step 7: Wire up the event handlers ---

    # When the user submits a message:
    #   1. Call respond() which streams the AI response
    #   2. Re-enable the textbox when done
    chat_msg = chat_input.submit(
        respond,
        inputs=[chat_input, chatbot, prev_response_id,
                instructions_input, model_input, effort_input],
        outputs=[chatbot, prev_response_id],
    )
    chat_msg.then(
        lambda: gr.MultimodalTextbox(interactive=True),
        outputs=[chat_input],
    )

    # Clear button resets everything
    clear_btn.click(
        clear_conversation,
        outputs=[chatbot, prev_response_id],
    )


# --- Step 8: Launch the app ---
# share=True creates a public *.gradio.live URL that works even inside
# JupyterHub containers (bypasses the nginx proxy). The link is temporary
# and expires after 72 hours.
if __name__ == "__main__":
    print(f"\n  Model   : {MODEL}")
    print(f"  Effort  : {REASONING_EFFORT}")
    print()
    demo.launch(share=True)
