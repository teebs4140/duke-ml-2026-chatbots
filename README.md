# Duke ML Chatbot

A progressive tutorial for building AI chatbots with Azure AI Foundry. Start with a simple terminal chat and work your way up to a polished web UI.

## Levels

| Level | What You Build | New Concepts |
|-------|---------------|-------------|
| **[1 - Chat](level-1-chat/)** | Terminal chatbot (+ Gradio option) | OpenAI client, Responses API, conversation chaining, system instructions |
| **[1B - Streaming](level-1-chat-streaming/)** | Terminal chat with streaming (+ Gradio option) | `stream=True`, event iteration, delta events |
| **[2 - Files](level-2-files/)** | Terminal chat + file upload | Base64 encoding, MIME types, multimodal input, file I/O |
| **[3 - Web](level-3-web/)** | Browser-based chat UI | HTTP APIs, SSE streaming, Gradio / React / vanilla JS, client-server architecture |

Each level has both **Python** and **TypeScript** implementations with identical functionality.

## Prerequisites

- Python 3.11+
- An Azure AI Foundry API key and endpoint
- Node.js 22+ *(only needed for TypeScript / Next.js levels)*

## Quick Setup

### 1. Clone the repository

```bash
git clone https://github.com/teebs4140/duke-ml-2026-chatbots.git
cd duke-ml-2026-chatbots
```

> **Already cloned?** Run `git pull` to get the latest updates.

### 2. Configure environment variables

```bash
cp .env.example .env
nano .env   # Or use vim, or JupyterLab's text editor
```

### 3. Create a virtual environment and install dependencies

**Option A — pip (works everywhere):**
```bash
python -m venv .venv
source .venv/bin/activate        # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**Option B — uv (faster, if you have it):**
```bash
uv sync    # creates .venv and installs deps in one step
source .venv/bin/activate
```

### 4. Start with Level 1

**Python:**
```bash
cd level-1-chat/python
python chat.py
```

> **Note:** Make sure the virtual environment is activated (`source .venv/bin/activate`) each time you open a new terminal.

### TypeScript Setup (Optional)

TypeScript versions are available at every level. No virtual environment needed — each level has its own `package.json`.

```bash
# From the project root, go into any level's typescript folder:
cd level-1-chat/typescript
npm install        # Install dependencies (one time per level)
npm run start      # Run the chatbot
```

The `.env` file at the project root is shared by all levels (Python and TypeScript). You only need to create it once.

---

## Jupyter Container Setup

If you're running this inside a JupyterHub container:

1. **Open a Terminal** from the JupyterHub launcher
2. **Clone and configure:**
   ```bash
   git clone https://github.com/teebs4140/duke-ml-2026-chatbots.git
   cd duke-ml-2026-chatbots
   cp .env.example .env
   nano .env   # Or use vim, or JupyterLab's text editor
   ```
3. **Create a virtual environment and install deps:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
4. **For TypeScript levels** (optional), install Node.js:
   ```bash
   conda install -y nodejs
   ```
5. **For web UI levels (Level 3)**, use the **Gradio** option — it generates a public URL that bypasses JupyterHub's nginx proxy. The Flask and Next.js options do not work inside Jupyter containers. See the [Level 3 README](level-3-web/README.md) for details.
6. **To preview `.md` files** (like the PRDs), open the file in JupyterLab, then right-click in the editor and select **"Show Markdown Preview"**.

---

## Project Structure

```
duke-ml-chatbot/
├── .env.example            # Template for Azure credentials
├── pyproject.toml          # Python deps (for uv)
├── requirements.txt        # Python deps (for pip)
├── PRDs/                   # Workshop exercise prompts (copy into Claude Code)
│   ├── 01_example-prompts.md
│   ├── 02_verbosity.md
│   ├── 03_max-output-tokens.md
│   ├── 04_truncation.md
│   └── 05_tool-calling.md
├── level-1-chat/           # Simple terminal chatbot
│   ├── python/chat.py
│   ├── typescript/chat.ts
│   └── gradio/chat.py      # Browser UI via Gradio
├── level-1-chat-streaming/ # Same thing, but with streaming
│   ├── python/chat.py
│   ├── typescript/chat.ts
│   └── gradio/chat.py      # Streaming browser UI via Gradio
├── level-2-files/          # Terminal chat + file upload
│   ├── python/chat.py
│   ├── typescript/chat.ts
│   └── sample-files/
└── level-3-web/            # Web UI
    ├── gradio/             # Gradio (recommended for Jupyter)
    ├── nextjs/             # Next.js + shadcn/ui
    └── flask/              # Flask + vanilla JS
```
