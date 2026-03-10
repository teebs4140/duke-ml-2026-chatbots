"""
Level 3: Flask Web Chat with Azure AI Foundry
==============================================
This is the web version of our chatbot -- a full browser-based chat UI powered
by a Flask backend. The server streams AI responses in real-time using
Server-Sent Events (SSE), so the user sees text appear word by word.

Key concepts you'll learn:
  - Building a Flask API that talks to Azure AI Foundry
  - Server-Sent Events (SSE) for real-time streaming
  - Handling file uploads with base64 encoding
  - Connecting a vanilla JS frontend to a Python backend

Architecture:
  Browser (index.html + app.js)
    |
    |  POST /api/chat  (JSON body with message, settings, optional file)
    v
  Flask server (this file)
    |
    |  client.responses.create(stream=True)
    v
  Azure AI Foundry (returns streamed response)
    |
    |  SSE: data: {"type":"delta","text":"..."} ...
    v
  Browser updates the chat UI in real-time
"""

# --- Step 1: Import libraries ---
# Flask        : Lightweight Python web framework
# OpenAI       : Official SDK -- works with Azure AI Foundry via base_url
# dotenv       : Loads secrets from .env so we don't hard-code them
# json         : Serialize Python dicts to JSON for SSE payloads
import base64
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request, stream_with_context
from openai import OpenAI


def _parse_data_field(data: str) -> tuple[str, str | None]:
    """Split a base64 data URI into raw base64 payload + detected mime type."""
    if "," not in data:
        return data, None

    header, b64_payload = data.split(",", 1)
    header = header.strip().lower()
    if header.startswith("data:") and ";base64" in header:
        mime_type = header[5 : header.index(";base64")] or None
        return b64_payload, mime_type

    return b64_payload, None


def _estimate_base64_decoded_bytes(base64_data: str) -> int:
    """Estimate decoded byte length from a base64 string."""
    sanitized = "".join(base64_data.split())
    if not sanitized:
        return 0
    padding = 2 if sanitized.endswith("==") else 1 if sanitized.endswith("=") else 0
    return max(0, (len(sanitized) * 3) // 4 - padding)


# --- Step 2: Load environment variables ---
# The .env file lives at the project root (three levels up from this script).
# It contains your API key, endpoint URL, model name, and other settings.
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(env_path)

# Read configuration from environment variables.
ENDPOINT = (os.getenv("AZURE_OPENAI_ENDPOINT") or "").strip()
API_KEY = (os.getenv("AZURE_OPENAI_API_KEY") or "").strip()
MODEL = os.getenv("MODEL_NAME", "gpt-5.2")
REASONING_EFFORT = os.getenv("REASONING_EFFORT", "low")
INSTRUCTIONS = os.getenv(
    "CHATBOT_INSTRUCTIONS",
    "You are a helpful assistant. Be concise and friendly.",
)

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
VALID_REASONING_EFFORTS = {"none", "low", "medium", "high"}
DEFAULT_FILE_ONLY_MESSAGE = "Please analyze the attached file."

client = (
    OpenAI(
        base_url=ENDPOINT,
        api_key=API_KEY,
        max_retries=10,
    )
    if ENDPOINT and API_KEY
    else None
)


# --- Step 3: Create the Flask app ---
app = Flask(__name__)


# =====================================================================
# Routes
# =====================================================================


@app.route("/")
def index():
    """Serve the main chat page.

    Flask looks for templates in a 'templates/' folder by default.
    We send down the default settings so the UI can pre-fill them.
    """
    return render_template(
        "index.html",
        default_model=MODEL,
        default_effort=REASONING_EFFORT,
        default_instructions=INSTRUCTIONS,
    )


@app.route("/api/chat", methods=["POST"])
def chat():
    """Handle a chat message and stream the AI response back via SSE.

    Expected JSON body:
      {
        "message":            "user's text" (optional if file is attached),
        "previousResponseId": "resp_abc123" or null,
        "instructions":       "system prompt override" (optional),
        "model":              "gpt-5.2" (optional),
        "reasoningEffort":    "low" | "medium" | "high" (optional),
        "file":               {"name": "...", "data": "data:...;base64,...", "mimeType": "..."} (optional)
      }

    Returns an SSE stream:
      data: {"type": "delta", "text": "partial text"}
      data: {"type": "done",  "responseId": "resp_xyz789"}
    """
    # --- Parse and validate the incoming JSON request ---
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON request body"}), 400

    message = data.get("message", "")
    previous_response_id = data.get("previousResponseId")
    instructions = data.get("instructions", INSTRUCTIONS)
    model = data.get("model", MODEL)
    reasoning_effort = data.get("reasoningEffort", REASONING_EFFORT)
    file_info = data.get("file")

    if message is not None and not isinstance(message, str):
        return jsonify({"error": "message must be a string"}), 400
    if previous_response_id is not None and not isinstance(previous_response_id, str):
        return jsonify({"error": "previousResponseId must be a string"}), 400
    if instructions is not None and not isinstance(instructions, str):
        return jsonify({"error": "instructions must be a string"}), 400
    if model is not None and not isinstance(model, str):
        return jsonify({"error": "model must be a string"}), 400
    if reasoning_effort is not None and not isinstance(reasoning_effort, str):
        return jsonify({"error": "reasoningEffort must be a string"}), 400

    message = (message or "").strip()
    previous_response_id = previous_response_id.strip() if previous_response_id else None
    instructions = (instructions or "").strip() or INSTRUCTIONS
    model = (model or "").strip() or MODEL
    reasoning_effort = (reasoning_effort or REASONING_EFFORT).strip().lower()

    if reasoning_effort not in VALID_REASONING_EFFORTS:
        return jsonify({"error": "reasoningEffort must be one of: none, low, medium, high"}), 400

    parsed_file: dict[str, str] | None = None
    if file_info is not None:
        if not isinstance(file_info, dict):
            return jsonify({"error": "file must be an object"}), 400

        filename = file_info.get("name")
        file_data = file_info.get("data")
        mime_type = file_info.get("mimeType")

        if not isinstance(filename, str) or not filename.strip():
            return jsonify({"error": "file.name is required"}), 400
        if not isinstance(file_data, str) or not file_data.strip():
            return jsonify({"error": "file.data is required"}), 400
        if mime_type is not None and not isinstance(mime_type, str):
            return jsonify({"error": "file.mimeType must be a string"}), 400

        base64_data, detected_mime = _parse_data_field(file_data)
        resolved_mime = (mime_type or detected_mime or "application/octet-stream").lower()
        decoded_size = _estimate_base64_decoded_bytes(base64_data)

        if decoded_size > MAX_FILE_SIZE_BYTES:
            return (
                jsonify(
                    {
                        "error": (
                            f"File too large. Maximum allowed size is "
                            f"{MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB."
                        )
                    }
                ),
                413,
            )

        parsed_file = {
            "name": filename.strip(),
            "mimeType": resolved_mime,
            "base64Data": base64_data,
            "dataUri": f"data:{resolved_mime};base64,{base64_data}",
        }

    if not message and parsed_file is None:
        return jsonify({"error": "Either message or file is required"}), 400

    # --- Build the API input ---
    # If the user attached a file, we send a structured array with both the
    # file (as base64) and the text message. Otherwise, a plain string is fine.
    #
    # The API handles different file types differently:
    #   - Images: use "input_image" with a data URI
    #   - PDFs:   use "input_file" with base64 data
    #   - Text:   decode and include inline (API rejects text files via input_file)
    message_for_model = message or DEFAULT_FILE_ONLY_MESSAGE
    if parsed_file:
        mime_type = parsed_file["mimeType"]

        # All file types must be wrapped in a {role: "user", content: [...]} message.
        # The API expects input to be an array of message objects, not raw content items.
        if mime_type.startswith("image/"):
            api_input = [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_image", "image_url": parsed_file["dataUri"]},
                        {"type": "input_text", "text": message_for_model},
                    ],
                }
            ]
        elif mime_type == "application/pdf":
            api_input = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_file",
                            "filename": parsed_file["name"],
                            "file_data": parsed_file["dataUri"],
                        },
                        {"type": "input_text", "text": message_for_model},
                    ],
                }
            ]
        else:
            # Text-based files: decode the base64 and include content inline
            try:
                text_content = base64.b64decode(parsed_file["base64Data"]).decode(
                    "utf-8", errors="replace"
                )
            except ValueError:
                return jsonify({"error": "Attached file is not valid base64 data"}), 400

            api_input = (
                f"[Attached file: {parsed_file['name']}]\n\n"
                f"{text_content}\n\n---\n\n{message_for_model}"
            )
    else:
        api_input = message

    # --- Stream the response back as SSE ---
    def generate():
        """Generator that yields SSE-formatted lines as the AI responds.

        We use client.responses.create(stream=True) to get an iterable of
        events. Each event has a .type property we can filter on:
          - "response.output_text.delta" : a chunk of text arrived
          - "response.completed"         : the full response is done
        """
        try:
            create_params = {
                "model": model,
                "input": api_input,
                "instructions": instructions,
                "reasoning": {"effort": reasoning_effort},
                "stream": True,
            }
            if previous_response_id:
                create_params["previous_response_id"] = previous_response_id

            if client is None:
                raise RuntimeError(
                    "Server configuration error: AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set."
                )

            stream = client.responses.create(**create_params)

            # Iterate over the stream and forward relevant events to the browser
            for event in stream:
                # A new chunk of output text -- send it to the browser immediately
                if event.type == "response.output_text.delta":
                    payload = json.dumps({"type": "delta", "text": event.delta})
                    yield f"data: {payload}\n\n"

                # The full response is complete -- send the response ID so the
                # browser can use it for the next turn (conversation chaining)
                elif event.type == "response.completed":
                    # Send token usage before the done event
                    usage = event.response.usage
                    if usage:
                        usage_payload = json.dumps(
                            {
                                "type": "usage",
                                "inputTokens": usage.input_tokens,
                                "outputTokens": usage.output_tokens,
                                "totalTokens": usage.total_tokens,
                            }
                        )
                        yield f"data: {usage_payload}\n\n"

                    payload = json.dumps(
                        {
                            "type": "done",
                            "responseId": event.response.id,
                        }
                    )
                    yield f"data: {payload}\n\n"

        except Exception as exc:
            # If something goes wrong, send the error to the browser so it can
            # display it instead of hanging forever.
            payload = json.dumps({"type": "error", "message": str(exc)})
            yield f"data: {payload}\n\n"

    # Return a streaming response with the correct SSE headers.
    # stream_with_context keeps the Flask request context alive during streaming.
    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",  # Don't cache the stream
            "X-Accel-Buffering": "no",  # Disable nginx buffering
            "Connection": "keep-alive",  # Keep the connection open
        },
    )


# --- Step 5: Run the development server ---
if __name__ == "__main__":
    # Validate that we have the required configuration
    if not ENDPOINT or not API_KEY:
        print("ERROR: Missing configuration!")
        print(f"  Looked for .env at: {env_path}")
        print("  Make sure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are set.")
        print("  Copy .env.example to .env and fill in your values.")
        raise SystemExit(1)

    print(f"\n  Model   : {MODEL}")
    print(f"  Effort  : {REASONING_EFFORT}")
    print(f"  Open http://localhost:5000 in your browser.\n")

    debug_mode = os.getenv("FLASK_DEBUG", "").lower() in {"1", "true", "yes", "on"}
    app.run(debug=debug_mode, host="0.0.0.0", port=5000)
