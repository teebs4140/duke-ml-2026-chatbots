# PRD: Add Response Verbosity

## Background

The Responses API supports a **verbosity** setting that tells the model how concise or detailed to be.

This is separate from `reasoning.effort`:

- `reasoning.effort` controls how much internal reasoning budget the model uses
- `verbosity` controls how long and detailed the visible answer is

This is a good workshop feature because the API change itself is tiny, and in levels that already expose settings to the user, the new control fits naturally next to model and reasoning effort.

## Important Implementation Detail

For the Responses API, `verbosity` is **not** a top-level parameter.

It belongs under `text`:

- Python: `text={"verbosity": "low"}`
- TypeScript: `text: { verbosity: "low" }`
- Dict-style calls: `"text": {"verbosity": "low"}`

## Requirements

Add a verbosity setting with allowed values:

- `low`
- `medium`
- `high`

Then pass that value into every relevant `client.responses.create()` call.

If you want the smallest possible implementation:

1. Reuse the existing settings flow in the level(s) you already built
2. Thread a `verbosity` variable into the request
3. Add one line to the Responses API call: `text={"verbosity": verbosity}`

The API change is one line. Exposing a user control is only extra plumbing where you want the user to choose it.

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
    text={"verbosity": VERBOSITY},
    previous_response_id=previous_response_id,
)
```

**TypeScript:**
```ts
const response = await client.responses.create({
  model: MODEL,
  input: userInput,
  instructions: INSTRUCTIONS,
  reasoning: { effort: REASONING_EFFORT },
  text: { verbosity: VERBOSITY },
  previous_response_id: previousResponseId,
});
```

**Dict-style calls (Flask / Gradio):**
```python
create_params = {
    "model": model,
    "input": api_input,
    "instructions": instructions,
    "reasoning": {"effort": reasoning_effort},
    "text": {"verbosity": verbosity},
    "stream": True,
}
```

## Files to Change

Apply to whichever level(s) you built.

### Level 1 — Terminal Chat
- `level-1-chat/python/chat.py` — `responses.create()` call (~line 112)
- `level-1-chat/typescript/chat.ts` — `responses.create()` call (~line 118)
- `level-1-chat/gradio/chat.py` — `responses.create()` call (~line 74)

### Level 1 — Streaming
- `level-1-chat-streaming/python/chat.py` — `responses.create()` call (~line 91)
- `level-1-chat-streaming/gradio/chat.py` — `responses.create()` call (~line 73)
- `level-1-chat-streaming/typescript/chat.ts` — `responses.create()` call (~line 94)

### Level 2 — File Upload
- `level-2-files/python/chat.py` — **two** `responses.create()` calls (~lines 279 and 293)
- `level-2-files/typescript/chat.ts` — **two** `responses.create()` calls (~lines 301 and 316)

### Level 3 — Web UI
- `level-3-web/flask/app.py` — add to `create_params` dict (~line 280)
- `level-3-web/gradio/app.py` — add to `create_params` dict (~line 191)
- `level-3-web/nextjs/src/app/api/chat/route.ts` — `responses.create()` call (~line 339)

## Verification

To verify the parameter is wired correctly:

1. Run the chatbot normally and confirm the request is still accepted
2. Try the same prompt with `low` and `high`
3. Confirm `low` is shorter and `high` is more detailed

If a request fails, the most likely mistake is placing `verbosity` at the top level instead of under `text`.
