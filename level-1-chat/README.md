# Level 1: Terminal Chatbot

A simple terminal chatbot that connects to Azure AI Foundry. This is the foundation for everything that follows -- just you and an AI, chatting in the terminal.

## What You'll Learn

- **OpenAI SDK with Azure** -- How to point the standard OpenAI client at Azure AI Foundry
- **Responses API** -- The modern API for sending messages and getting completions
- **Multi-turn conversation** -- Using `previous_response_id` to maintain conversation history
- **Reasoning effort** -- Controlling how much "thinking" the model does (low/medium/high)
- **System instructions** -- Shaping the chatbot's personality and behavior
- **Environment configuration** -- Keeping secrets out of your code with `.env` files

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

> **Note:** If you haven't created the virtual environment yet, see the [Quick Setup](../README.md#quick-setup) in the root README.

### TypeScript

```bash
# Install dependencies
cd level-1-chat/typescript
npm install

# Run the chatbot
npm start
```

## Code Walkthrough

Both the Python and TypeScript versions follow the same six steps:

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

## Try This!

1. **Change the personality** -- Edit `CHATBOT_INSTRUCTIONS` in your `.env` file. Try "You are a pirate" or "You are a Socratic tutor who only answers with questions."

2. **Change reasoning effort** -- Set `REASONING_EFFORT` to `high` and ask a math question. Then try `low`. Notice the difference in response quality and speed.

3. **Add a `/help` command** -- Modify the code to recognize `/help` and print a list of available commands. This is how slash commands work in real chat apps!

## What's Next?

In **Level 2**, we'll move this chatbot to the web with a Streamlit/Next.js UI and add streaming responses so you can see the AI "typing" in real time.
