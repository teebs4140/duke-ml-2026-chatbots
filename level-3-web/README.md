# Level 3: Web UI Chat

Build a browser-based chat application with streaming responses, file uploads, and a settings panel. Three implementations:

- **Gradio** — Python-only, one file, works inside Jupyter containers (recommended for JupyterHub)
- **Next.js** — React + shadcn/ui (modern full-stack framework)
- **Flask** — Python + vanilla JavaScript (see the raw DOM manipulation)

> **New here?** For a conceptual walkthrough of how the web UI works (no coding required), see [CONCEPTS.md](CONCEPTS.md).

## What You'll Learn

- **HTTP APIs**: How a browser talks to a server via POST requests
- **Server-Sent Events (SSE)**: Streaming AI responses token-by-token to the browser
- **Client-server architecture**: Frontend sends requests → backend calls Azure → streams back to frontend
- **React state management** (Next.js) vs **vanilla DOM manipulation** (Flask)
- **FileReader API**: Converting files to base64 in the browser

## How to Run

### Option A: Gradio (recommended for Jupyter containers)

Gradio is the simplest option — a single Python file with no frontend code. When launched with `share=True`, it generates a public URL that works from anywhere, which makes it the best choice for JupyterHub containers where `localhost` ports aren't directly accessible.

```bash
# Make sure your virtual environment is activated first:
source .venv/bin/activate

cd level-3-web/gradio
python app.py
```

Gradio will print two URLs:
```
* Running on local URL:  http://127.0.0.1:7860
* Running on public URL: https://abc123def456.gradio.live
```

**Click the public URL** to open the chatbot in your browser. This works from JupyterHub, your laptop, or anywhere — no proxy configuration needed.

> **Note:** The public URL expires after 72 hours. Just restart the script to get a new one.

### Option B: Next.js (TypeScript + React)

> **Jupyter users:** This does not work inside JupyterHub containers. Use Gradio (Option A) instead.

```bash
cd level-3-web/nextjs

# Next.js reads env vars from .env.local (not .env)
# Copy the project root .env into this directory:
cp ../../.env .env.local

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option C: Flask (Python + vanilla JS)

> **Jupyter users:** This does not work inside JupyterHub containers. Use Gradio (Option A) instead.

```bash
# Make sure your virtual environment is activated first:
source .venv/bin/activate    # On Windows: .venv\Scripts\activate

cd level-3-web/flask
python app.py
```

> **Note:** If you haven't created the virtual environment yet, see the [Quick Setup](../README.md#quick-setup) in the root README.

Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## Architecture

Both versions follow the same pattern:

```
Browser                    Server                    Azure AI Foundry
  │                          │                            │
  │  POST /api/chat          │                            │
  │  {message, file, ...}    │                            │
  │ ─────────────────────>   │                            │
  │                          │  responses.create(stream)  │
  │                          │  ──────────────────────>   │
  │                          │                            │
  │   SSE: delta "Hello"     │   <── stream chunk         │
  │ <─────────────────────   │                            │
  │   SSE: delta " world"    │   <── stream chunk         │
  │ <─────────────────────   │                            │
  │   SSE: done + responseId │   <── stream complete      │
  │ <─────────────────────   │                            │
```

### Key Files

**Gradio:**
| File | Purpose |
|------|---------|
| `gradio/app.py` | Everything — UI, API calls, streaming, file handling in one file |

**Next.js:**
| File | Purpose |
|------|---------|
| `src/app/api/chat/route.ts` | API route — calls Azure, returns SSE stream |
| `src/hooks/use-chat.ts` | React hook — manages messages, streaming, conversation chaining |
| `src/components/chat-interface.tsx` | Main UI orchestrator |
| `src/components/message-bubble.tsx` | Renders messages with Markdown |
| `src/components/settings-panel.tsx` | Instructions, model, reasoning controls |

**Flask:**
| File | Purpose |
|------|---------|
| `app.py` | Server — routes + SSE streaming |
| `static/app.js` | Vanilla JS — fetch, SSE parsing, DOM updates |
| `templates/index.html` | HTML structure |
| `static/style.css` | Styling |

## Code Walkthrough

### 1. The API endpoint receives a chat request

The browser sends a POST with the message, any attached file (as base64), the previous response ID (for conversation continuity), and settings.

### 2. The server calls Azure AI Foundry with `stream: true`

Same `client.responses.create()` pattern as Levels 1 and 2, but with `stream: true`. This returns an event stream instead of waiting for the full response.

### 3. The server forwards chunks as SSE

As each text chunk arrives from Azure, the server immediately sends it to the browser as a Server-Sent Event:
```
data: {"type":"delta","text":"Hello"}
data: {"type":"delta","text":" world"}
data: {"type":"done","responseId":"resp_abc123"}
```

### 4. The browser renders tokens as they arrive

The frontend reads the SSE stream and appends each text delta to the assistant's message in real time — creating the "typing" effect.

### 5. The response ID is stored for the next turn

Just like in Levels 1 and 2, `previousResponseId` chains the conversation. The browser stores it and sends it with the next message.

## Try This!

1. **Change the system instructions** via the settings panel and see how the chatbot's personality changes
2. **Upload an image** (PNG/JPG) and ask the AI to describe it
3. **Compare the implementations**: Read `app.js` (vanilla JS) side-by-side with `use-chat.ts` (React) — same logic, different patterns
4. **Add a feature**: Try adding a "copy message" button to each message bubble
5. **Change the theme**: Modify the CSS colors to match your own branding
