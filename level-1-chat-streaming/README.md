# Level 1B: Chat with Streaming

This builds on Level 1 by adding **streaming** -- instead of waiting for the full response (which can take several seconds), tokens appear one by one as the AI generates them.

## What's New

Only **3 lines** change from Level 1 (terminal versions):

1. **`stream=True`** in the API call
2. **A `for` loop** that iterates over events as they arrive
3. **`print(event.delta, end="", flush=True)`** to print each chunk immediately

For the Gradio version, the change is even simpler: the `respond()` function becomes a **generator** (uses `yield` instead of `return`). Gradio detects this and streams automatically.

## How to Run

### Python

```bash
# Make sure your virtual environment is activated first:
source .venv/bin/activate    # On Windows: .venv\Scripts\activate

cd level-1-chat-streaming/python
python chat.py
```

> **Note:** If you haven't created the virtual environment yet, see the [Quick Setup](../README.md#quick-setup) in the root README.

### TypeScript

```bash
cd level-1-chat-streaming/typescript
npm install
npm run start
```

### Gradio (Browser UI)

The same streaming logic, but in the browser. The `respond()` function becomes a generator that yields partial text -- Gradio re-renders the chat on each yield.

```bash
python level-1-chat-streaming/gradio/chat.py
```

> This launches a Gradio app with `share=True`, giving you a public URL that works inside JupyterHub.

## The Key Change

**Level 1 (non-streaming):**
```python
response = client.responses.create(
    model=MODEL,
    input=user_input,
    ...
)
print(response.output_text)
```

**Level 1B (streaming):**
```python
stream = client.responses.create(
    model=MODEL,
    input=user_input,
    ...,
    stream=True,  # <-- Just add this!
)
for event in stream:
    if event.type == "response.output_text.delta":
        print(event.delta, end="", flush=True)
    elif event.type == "response.completed":
        previous_response_id = event.response.id
```

## Stream Event Types

| Event Type | What It Means | What You Get |
|-----------|---------------|-------------|
| `response.output_text.delta` | A chunk of text arrived | `event.delta` = the new text |
| `response.completed` | Response is finished | `event.response.id` = ID for next turn |

## Why Stream?

- **Better UX**: Users see progress immediately instead of staring at a blank screen
- **Lower perceived latency**: The first token appears in ~200ms vs waiting 2-10s for the full response
- **Same API**: Just add `stream=True` -- everything else stays the same

## Try This!

1. **Compare the feel**: Run Level 1 and Level 1B side by side -- notice how much snappier streaming feels
2. **Count the events**: Add a counter to see how many delta events a typical response has
3. **Log event types**: Print `event.type` for every event to see all the event types the API sends (there are more than just the two we use!)
