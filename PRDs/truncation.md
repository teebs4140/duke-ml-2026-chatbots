# PRD: Add Conversation Truncation

## Background

Every AI model has a **context window** — a limit on how much text (tokens) it can process in a single request. As a conversation grows, the accumulated messages (yours + the model's) consume more of this window. When the conversation exceeds the limit, the API returns an error.

There are two common strategies to handle this:

| Strategy | How it works | Complexity |
|----------|-------------|------------|
| **Truncation** | Drop the oldest messages, keep recent ones (sliding window) | One-line change |
| **Compaction** | Summarize old messages into a shorter recap | Requires a summarization pipeline |

We'll use **truncation** — the OpenAI SDK's Responses API has a built-in `truncation` parameter that handles everything server-side.

## Requirements

Add `truncation="auto"` to every `client.responses.create()` call in whichever level(s) you built. This tells the API to automatically drop the oldest messages when the conversation would exceed the context window.

The default value is `"disabled"`, which returns an error instead.

## Example

**Before (Level 1 Python):**
```python
response = client.responses.create(
    model=MODEL,
    input=user_input,
    instructions=INSTRUCTIONS,
    reasoning={"effort": REASONING_EFFORT},
    previous_response_id=previous_response_id,
)
```

**After:**
```python
response = client.responses.create(
    model=MODEL,
    input=user_input,
    instructions=INSTRUCTIONS,
    reasoning={"effort": REASONING_EFFORT},
    previous_response_id=previous_response_id,
    truncation="auto",  # Drop oldest messages if context window is exceeded
)
```

For TypeScript, use `truncation: "auto"` (colon instead of equals).

For dict-style calls (Flask/Gradio), add `"truncation": "auto"` to the `create_params` dictionary.

## Files to Change

Apply to whichever level(s) you built. Each change is adding one line.

### Level 1 — Terminal Chat
- `level-1-chat/python/chat.py` — `responses.create()` call (~line 112)
- `level-1-chat/typescript/chat.ts` — `responses.create()` call (~line 118)

### Level 1 — Streaming
- `level-1-chat-streaming/python/chat.py` — `responses.create()` call (~line 91)
- `level-1-chat-streaming/gradio/chat.py` — `responses.create()` call (~line 73)
- `level-1-chat-streaming/typescript/chat.ts` — `responses.create()` call (~line 94)

### Level 2 — File Upload
- `level-2-files/python/chat.py` — **two** `responses.create()` calls (~lines 279 and 293)

### Level 3 — Web UI
- `level-3-web/flask/app.py` — add to `create_params` dict (~line 280)
- `level-3-web/gradio/app.py` — add to `create_params` dict (~line 191)
- `level-3-web/nextjs/src/app/api/chat/route.ts` — `responses.create()` call (~line 339)

## Verification

Context windows are very large (128K+ tokens), so you won't hit the limit during testing. To verify your change is correct:

1. Run your chatbot normally — if it still works, the parameter was accepted
2. Check that `truncation="auto"` appears inside the `responses.create()` call (not outside it)
