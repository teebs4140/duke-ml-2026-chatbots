# Level 1: Simple Chatbot

A simple chatbot that connects to Azure AI Foundry. This is the foundation for everything that follows -- just you and an AI, chatting in a loop. The main examples come in three flavors:

| Variant | Interface | File |
|---------|-----------|------|
| **Python** | Terminal | `python/chat.py` |
| **TypeScript** | Terminal | `typescript/chat.ts` |
| **Gradio** | Browser | `gradio/chat.py` |

There is also a stripped-down Python variant at [chat_responses_only.py](/dcri/sasusers/home/dt132/AI-work/duke-ml-chatbot/level-1-chat/python/chat_responses_only.py) if you want the smallest possible multi-turn example built around a single `client.responses.create(...)` call.

## What You'll Learn

- **OpenAI SDK with Azure** -- How to point the standard OpenAI client at Azure AI Foundry
- **Responses API** -- The modern API for sending messages and getting completions
- **Multi-turn conversation** -- Using `previous_response_id` to maintain conversation history
- **Reasoning effort** -- Controlling how much "thinking" the model does (low/medium/high)
- **System instructions** -- Shaping the chatbot's personality and behavior
- **Environment configuration** -- Keeping secrets out of your code with `.env` files
- **Gradio basics** -- Building a browser chat UI with `gr.ChatInterface` (Gradio variant only)

## Prerequisites

1. An Azure AI Foundry endpoint with a deployed model
2. Your API key and endpoint URL
3. A `.env` file at the project root (copy from `.env.example`)

```bash
# From the project root
cp .env.example .env
# Then edit .env with your actual values
```

## How to Run

### Python

```bash
# Make sure your virtual environment is activated first:
source .venv/bin/activate    # On Windows: .venv\Scripts\activate

# Run the chatbot (from the project root)
python level-1-chat/python/chat.py
```

### Python: Minimal Responses-Only Version

This version keeps only the essentials:

- Loads `.env`
- Creates the `OpenAI` client
- Reads `CHATBOT_INSTRUCTIONS`
- Chains turns with `previous_response_id`
- Calls `client.responses.create(...)` inside the loop

```bash
python level-1-chat/python/chat_responses_only.py
```

Use this when you want the simplest possible example that still preserves conversation history and system instructions.

> **Note:** If you haven't created the virtual environment yet, see the [Quick Setup](../README.md#quick-setup) in the root README.

### TypeScript

```bash
# Install dependencies
cd level-1-chat/typescript
npm install

# Run the chatbot
npm start
```

### Gradio (Browser UI)

The same chat loop, but in the browser instead of the terminal. Uses `gr.ChatInterface` for the simplest possible web chat.

```bash
python level-1-chat/gradio/chat.py
```

> This launches a Gradio app with `share=True`, giving you a public URL that works inside JupyterHub.

## Code Walkthrough

All three versions follow the same structure (Steps 1-4 are identical):

### Step 1 -- Import Libraries

We use the official OpenAI SDK, which works with Azure AI Foundry out of the box. The `dotenv` library loads our configuration from a `.env` file.

### Step 2 -- Load Environment Variables

Settings like API keys and model names live in a `.env` file at the project root. This keeps secrets out of your source code.

```
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key-here
MODEL_NAME=gpt-5.2
REASONING_EFFORT=low
```

### Step 3 -- Validate Configuration

Before doing anything, we check that the required variables are set. Better to fail with a clear message than a cryptic SDK error.

### Step 4 -- Create the Client

The key insight: Azure AI Foundry is **OpenAI-compatible**. We create a standard `OpenAI` client and set `base_url` to your endpoint. That's it.

```python
client = OpenAI(
    base_url=ENDPOINT,
    api_key=API_KEY,
)
```

### Step 5 -- Welcome Banner

A small quality-of-life touch: print configuration details so you can see what model and settings are active.

### Step 6 -- Conversation Loop

The core loop: read input, send to API, print response, repeat.

The magic of multi-turn conversation is `previous_response_id`. The API stores conversation history server-side. On each turn, we pass back the ID of the last response, and the API knows to continue that conversation. Set it to `None`/`null` to start fresh.

```python
response = client.responses.create(
    model=MODEL,
    input=user_input,
    instructions=INSTRUCTIONS,
    reasoning={"effort": REASONING_EFFORT},
    previous_response_id=previous_response_id,
)
```

If you want the same chaining behavior with less scaffolding, see [chat_responses_only.py](/dcri/sasusers/home/dt132/AI-work/duke-ml-chatbot/level-1-chat/python/chat_responses_only.py). That script keeps just `input`, `instructions`, `previous_response_id`, and the `responses.create(...)` call.

### Gradio variant differences

The Gradio version replaces Steps 5-6 with a browser UI:

- **Step 5** -- A `respond()` function that sends the message to the API and returns the full response (no streaming, matching the terminal version)
- **Step 6** -- `gr.ChatInterface` handles the chat display, text input, and history automatically. We just provide the respond function
- **Step 7** -- `demo.launch(share=True)` starts the web server and generates a public URL

## Try This!

1. **Change the personality** -- Edit `CHATBOT_INSTRUCTIONS` in your `.env` file. Try "You are a pirate" or "You are a Socratic tutor who only answers with questions."

2. **Change reasoning effort** -- Set `REASONING_EFFORT` to `high` and ask a math question. Then try `low`. Notice the difference in response quality and speed.

3. **Add a `/help` command** -- Modify the code to recognize `/help` and print a list of available commands. This is how slash commands work in real chat apps!

## What's Next?

- **Level 1B** adds streaming to the terminal versions so you can see the AI "typing" in real time.
- **Level 2** adds file/image uploads so you can send documents to the AI.
- **Level 3** builds full web UIs (Flask, Next.js, Gradio) with all the bells and whistles.
