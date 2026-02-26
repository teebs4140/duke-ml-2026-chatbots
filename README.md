# Duke ML Chatbot

A progressive tutorial for building AI chatbots with Azure AI Foundry. Start with a simple terminal chat and work your way up to a polished web UI.

## Levels

| Level | What You Build | New Concepts |
|-------|---------------|-------------|
| **[1 - Chat](level-1-chat/)** | Terminal chatbot | OpenAI client, Responses API, conversation chaining, system instructions |
| **[1B - Streaming](level-1-chat-streaming/)** | Terminal chat with streaming | `stream=True`, event iteration, delta events |
| **[2 - Files](level-2-files/)** | Terminal chat + file upload | Base64 encoding, MIME types, multimodal input, file I/O |
| **[3 - Web](level-3-web/)** | Browser-based chat UI | HTTP APIs, SSE streaming, React / vanilla JS, client-server architecture |

Each level has both **Python** and **TypeScript** implementations with identical functionality.

## Prerequisites

- Python 3.11+
- An Azure AI Foundry API key and endpoint
- Node.js 22+ *(only needed for TypeScript / Next.js levels)*

## Quick Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd duke-ml-chatbot
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your Azure AI Foundry credentials
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
   git clone <repo-url>
   cd duke-ml-chatbot
   cp .env.example .env
   # Edit .env with your credentials (use nano, vim, or JupyterLab's text editor)
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
5. **For web UI levels (Level 3)**, see the [Level 3 README](level-3-web/README.md) for instructions on accessing web servers through JupyterHub's proxy.

---

## Project Structure

```
duke-ml-chatbot/
├── .env.example            # Template for Azure credentials
├── pyproject.toml          # Python deps (for uv)
├── requirements.txt        # Python deps (for pip)
├── level-1-chat/           # Simple terminal chatbot
│   ├── python/chat.py
│   └── typescript/chat.ts
├── level-1-chat-streaming/ # Same thing, but with streaming
│   ├── python/chat.py
│   └── typescript/chat.ts
├── level-2-files/          # Terminal chat + file upload
│   ├── python/chat.py
│   ├── typescript/chat.ts
│   └── sample-files/
└── level-3-web/            # Web UI
    ├── nextjs/             # Next.js + shadcn/ui
    └── flask/              # Flask + vanilla JS
```
