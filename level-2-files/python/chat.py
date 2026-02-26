#!/usr/bin/env python3
"""
Level 2 - Terminal Chatbot with File Upload
============================================
Extends Level 1 with the ability to attach files (PDFs, images, text, etc.)
and send them to the AI alongside your messages.

New concepts:
  - Base64 encoding (converting binary files to text for the API)
  - MIME types (telling the API what kind of file you're sending)
  - Multimodal input (mixing text and files in one message)

Usage:
  python chat.py

Commands:
  /upload <path>  Attach a file to your next message
  /files          Show currently attached files
  /clear          Clear conversation history AND attached files
  /help           Show available commands
  /quit           Exit the chatbot
"""

import os
import sys
# --- NEW IN LEVEL 2 ---
import base64          # Converts binary file data to text (API-safe)
import mimetypes       # Guesses file types from extensions (.pdf -> application/pdf)
# --- END NEW ---
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# ========================================
# Load Environment Variables
# ========================================
# Walk up two directories from this file to find the project root's .env
#   level-2-files/python/chat.py -> duke-ml-chatbot/.env
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(env_path)

# ========================================
# Configuration (same as Level 1)
# ========================================
# Read settings from environment variables (see .env.example for details)
ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")         # Your Azure AI Foundry URL
API_KEY = os.getenv("AZURE_OPENAI_API_KEY")           # Your API key
MODEL = os.getenv("MODEL_NAME", "gpt-5.2")            # Which model to use
REASONING_EFFORT = os.getenv("REASONING_EFFORT", "low")  # low / medium / high
INSTRUCTIONS = os.getenv(
    "CHATBOT_INSTRUCTIONS",
    "You are a helpful assistant. Be concise and friendly.",
)

if not ENDPOINT or not API_KEY:
    print("ERROR: Missing configuration!")
    print(f"  Looked for .env at: {env_path}")
    print("  Make sure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are set.")
    print("  Copy .env.example to .env and fill in your values.")
    raise SystemExit(1)

# ========================================
# Create the OpenAI Client (same as Level 1)
# ========================================
# We use the generic OpenAI client pointed at Azure's v1-compatible endpoint.
# This works with all three Azure endpoint formats.
client = OpenAI(
    base_url=f"{ENDPOINT.rstrip('/')}/openai/v1/",
    api_key=API_KEY,
    max_retries=10,
)


# --- NEW IN LEVEL 2 ---
# ========================================
# File Encoding Helper
# ========================================
def encode_file(file_path: str) -> tuple[str, str, str]:
    """
    Read a file from disk and prepare it for the API.

    Steps:
      1. Detect the MIME type (e.g., "image/png", "application/pdf")
      2. Read the raw bytes
      3. Encode them as base64 text

    Args:
        file_path: Path to the file on disk.

    Returns:
        A tuple of (filename, mime_type, base64_data).
    """
    path = Path(file_path)

    # Guess the MIME type from the file extension
    # e.g., ".pdf" -> "application/pdf", ".png" -> "image/png"
    # Falls back to "application/octet-stream" (generic binary) if unknown
    mime_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"

    # Read the file as raw bytes and convert to base64 text
    # Base64 turns binary data into ASCII characters so it can be
    # safely included in JSON API requests.
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")

    return path.name, mime_type, data


# --- NEW IN LEVEL 2 ---
# The API only accepts certain file types via input_file (PDFs, images).
# For text-based files (.txt, .csv, .md, .json, etc.), we read the content
# as plain text and include it in the prompt instead.
TEXT_EXTENSIONS = {".txt", ".csv", ".md", ".json", ".py", ".js", ".ts", ".html", ".css", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".log", ".sh", ".bash", ".r", ".sas"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def is_text_file(filename: str) -> bool:
    """Check if a file should be sent as inline text rather than input_file."""
    return Path(filename).suffix.lower() in TEXT_EXTENSIONS


def is_image_file(filename: str) -> bool:
    """Check if a file is an image (sent via input_image)."""
    return Path(filename).suffix.lower() in IMAGE_EXTENSIONS


def read_text_file(file_path: str) -> tuple[str, str]:
    """Read a text file and return (filename, text_content)."""
    path = Path(file_path)
    return path.name, path.read_text(encoding="utf-8", errors="replace")
# --- END NEW ---


# ========================================
# Chat Loop
# ========================================
def main():
    """Run the interactive chat loop with file upload support."""
    print("=" * 50)
    print("  Level 2 - Chat with File Upload")
    print("=" * 50)
    print(f"  Model:   {MODEL}")
    print(f"  Effort:  {REASONING_EFFORT}")
    print()
    print("  Commands:")
    print("    /upload <path>  Attach a file")
    print("    /files          Show attached files")
    print("    /clear          Clear history & files")
    print("    /help           Show commands")
    print("    /quit           Exit")
    print("=" * 50)
    print()

    # Conversation state
    previous_response_id = None   # Links messages into a conversation

    # --- NEW IN LEVEL 2 ---
    # List of attached files. Each entry is a dict with the original file_path
    # so we can decide at send time whether to use input_file, input_image,
    # or inline text (the API only accepts PDFs via input_file).
    attached_files: list[dict] = []   # [{"path": str, "name": str, "mime": str}]
    # --- END NEW ---

    while True:
        # Get user input
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue

        # ----------------------------------------
        # Handle slash commands
        # ----------------------------------------
        if user_input.lower() == "/quit":
            print("Goodbye!")
            break

        if user_input.lower() == "/help":
            print("\n  /upload <path>  Attach a file to your next message")
            print("  /files          Show currently attached files")
            print("  /clear          Clear conversation history and files")
            print("  /help           Show this help message")
            print("  /quit           Exit the chatbot\n")
            continue

        if user_input.lower() == "/clear":
            previous_response_id = None
            # --- NEW IN LEVEL 2 ---
            attached_files.clear()   # Also clear any attached files
            # --- END NEW ---
            print("  Conversation and files cleared.\n")
            continue

        # --- NEW IN LEVEL 2 ---
        if user_input.lower() == "/files":
            if not attached_files:
                print("  No files attached.\n")
            else:
                print(f"  {len(attached_files)} file(s) attached:")
                for f in attached_files:
                    print(f"    - {f['name']} ({f['mime']})")
                print()
            continue

        if user_input.lower().startswith("/upload"):
            # Parse the file path from the command
            parts = user_input.split(maxsplit=1)
            if len(parts) < 2:
                print("  Usage: /upload <file-path>\n")
                continue

            file_path = parts[1].strip()

            # Validate the file exists
            if not Path(file_path).is_file():
                print(f"  File not found: {file_path}\n")
                continue

            # Store the file info (we encode at send time)
            try:
                path_obj = Path(file_path)
                mime = mimetypes.guess_type(str(path_obj))[0] or "application/octet-stream"
                attached_files.append({"path": file_path, "name": path_obj.name, "mime": mime})
                print(f"  Attached: {path_obj.name} ({mime})")
                print(f"  Total files: {len(attached_files)}\n")
            except Exception as e:
                print(f"  Error reading file: {e}\n")
            continue
        # --- END NEW ---

        # ----------------------------------------
        # Send message to the AI
        # ----------------------------------------
        try:
            # --- NEW IN LEVEL 2 ---
            # If files are attached, build a multimodal input array
            # that combines file data and text in one message.
            #
            # The API handles different file types differently:
            #   - PDFs:   use "input_file" with base64 data
            #   - Images: use "input_image" with a data URI
            #   - Text:   read the content and include it inline as text
            #             (the API doesn't accept .txt/.csv/etc. via input_file)
            if attached_files:
                content = []
                for f in attached_files:
                    if is_image_file(f["name"]):
                        # Images use input_image with a data URI
                        _, _, b64data = encode_file(f["path"])
                        content.append({
                            "type": "input_image",
                            "image_url": f"data:{f['mime']};base64,{b64data}",
                        })
                    elif is_text_file(f["name"]):
                        # Text files: read content and include it directly
                        name, text_content = read_text_file(f["path"])
                        content.append({
                            "type": "input_text",
                            "text": f"[Attached file: {name}]\n\n{text_content}",
                        })
                    else:
                        # PDFs and other binary files: use input_file with base64
                        name, mime, b64data = encode_file(f["path"])
                        content.append({
                            "type": "input_file",
                            "filename": name,
                            "file_data": f"data:{mime};base64,{b64data}",
                        })

                # The user's text message comes last
                content.append({"type": "input_text", "text": user_input})

                # Send the multimodal message
                response = client.responses.create(
                    model=MODEL,
                    input=[{"role": "user", "content": content}],
                    instructions=INSTRUCTIONS,
                    reasoning={"effort": REASONING_EFFORT},
                    previous_response_id=previous_response_id,
                )

                # Clear attached files after sending (they've been included)
                print(f"  (Sent {len(attached_files)} file(s) with your message)")
                attached_files.clear()

            else:
                # No files attached - simple text input (same as Level 1)
                response = client.responses.create(
                    model=MODEL,
                    input=user_input,
                    instructions=INSTRUCTIONS,
                    reasoning={"effort": REASONING_EFFORT},
                    previous_response_id=previous_response_id,
                )
            # --- END NEW ---

            # Save the response ID so the next message continues the conversation
            previous_response_id = response.id

            # Print the assistant's reply
            print(f"\nAssistant: {response.output_text}")

            # Show token usage so you can track context consumption
            if response.usage:
                print(f"  [tokens: {response.usage.input_tokens} in, {response.usage.output_tokens} out, {response.usage.total_tokens} total]")
            print()

        except Exception as e:
            print(f"\n  Error: {e}\n")


if __name__ == "__main__":
    main()
