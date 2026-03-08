# PRD: Add Max Output Tokens

## Background

The Responses API supports `max_output_tokens`, which sets an upper bound on how many tokens the model can generate for a response.

This is useful for:

- keeping answers short in demos
- controlling cost
- preventing overly long responses
- giving users a simple "response length cap" setting

Unlike `verbosity`, `max_output_tokens` is a **top-level** Responses API parameter.

## Requirements

Add `max_output_tokens` to every relevant `client.responses.create()` call in whichever level(s) you built.

If you want users to control it, thread a numeric setting into the request and pass it directly through.

Examples:

- short answers: `max_output_tokens=150`
- medium answers: `max_output_tokens=400`
- long answers: `max_output_tokens=800`

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
    max_output_tokens=MAX_OUTPUT_TOKENS,
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
  max_output_tokens: MAX_OUTPUT_TOKENS,
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
    "max_output_tokens": max_output_tokens,
    "stream": True,
}
```

## Notes

- `max_output_tokens` includes visible output tokens and reasoning tokens
- if the model hits the cap, the response may end earlier than the user expects
- this is a better fit for a numeric input than a low/medium/high dropdown

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

This one is easy to verify:

1. Set `max_output_tokens` to a small value like `50`
2. Ask for something that would normally produce a long answer
3. Confirm the response is noticeably shorter
4. Raise the value and confirm the answer gets longer again

If the request succeeds, the parameter was accepted. If the output is cut short, that is expected behavior when the cap is reached.
