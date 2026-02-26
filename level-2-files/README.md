# Level 2 - Terminal Chat with File Upload

Build on Level 1 by adding the ability to **attach files** (PDFs, images, text files, etc.) and send them to the AI alongside your questions.

## What You'll Learn

- **Base64 encoding** -- how to convert binary files into text that APIs can accept
- **MIME types** -- how computers identify file formats (`application/pdf`, `image/png`, etc.)
- **Multimodal input** -- sending a mix of text and files in a single API request
- **File I/O** -- reading files from disk in Python and TypeScript

## Prerequisites

- Completed [Level 1](../level-1-chat/) (or at least read through it)
- Azure AI Foundry credentials in your `.env` file (see [root README](../README.md))

## How to Run

### Python

From the project root:

    # Make sure your virtual environment is activated first:
    source .venv/bin/activate    # On Windows: .venv\Scripts\activate

    cd level-2-files/python
    python chat.py

> **Note:** If you haven't created the virtual environment yet, see the [Quick Setup](../README.md#quick-setup) in the root README.

### TypeScript

From the project root:

    cd level-2-files/typescript
    npm install
    npx ts-node chat.ts

## New Commands (added to Level 1)

| Command            | What It Does                          |
|--------------------|---------------------------------------|
| `/upload <path>`   | Attach a file to your next message    |
| `/files`           | List currently attached files         |
| `/clear`           | Clear conversation history AND files  |

## Example Session

    You: /upload ../sample-files/sample.txt
      Attached: sample.txt (text/plain)
      Total files: 1

    You: What are three interesting facts from the attached file?
      (Sent 1 file(s) with your message)

    Assistant: Here are three interesting facts from the file:
    1. Duke's campus includes 8,610 acres with one of the largest
       university-maintained forests in the US.
    2. The Blue Devil mascot was inspired by a French WWI Alpine unit.
    3. Duke Chapel stands 210 feet tall and took four years to build.

    You: /clear
      Conversation and files cleared.

## Code Walkthrough

Everything new in Level 2 is marked with `# --- NEW IN LEVEL 2 ---` comments in the code. Here is what changed from Level 1:

### 1. File Encoding (`encode_file` function)

The API cannot receive raw binary files. Instead, we:

1. **Detect the MIME type** from the file extension (`.pdf` becomes `application/pdf`)
2. **Read the raw bytes** from disk
3. **Base64-encode** them into a text string

Base64 is a way to represent binary data using only printable ASCII characters (A-Z, a-z, 0-9, +, /). This makes it safe to embed inside JSON.

### 2. Building Multimodal Input

When files are attached, we build a content array instead of a plain string:

    content = [
        {"type": "input_file", "filename": "report.pdf", "file_data": "data:application/pdf;base64,JVBERi0x..."},
        {"type": "input_text", "text": "Summarize this report"}
    ]

The `file_data` field uses a **data URI** format: `data:<mime-type>;base64,<encoded-data>`.

### 3. Conversation Continuity

File uploads work with `previous_response_id` just like text messages. The AI remembers both the files and the text from earlier turns.

## Try This!

1. **Upload the sample file** -- use `/upload ../sample-files/sample.txt` and ask questions about it
2. **Upload a PDF** -- try a research paper or syllabus and ask for a summary
3. **Upload an image** -- attach a photo or diagram and ask the AI to describe it
4. **Multiple files** -- use `/upload` twice before sending a message to attach two files at once
5. **Compare files** -- upload two text files and ask the AI to compare them

## Next Steps

Ready for a graphical interface? Head to [Level 3 - Web UI](../level-3-web/) to build a browser-based chat with streaming responses.
