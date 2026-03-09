# Level 3: How the Web UI Works

A conceptual guide to the web chatbot. You won't build this yourself during the workshop, but understanding how it works will deepen your knowledge of how real AI-powered applications are built.

**What you'll learn:**

- Why web apps split into a **client** (browser) and **server** (backend)
- How the browser sends requests to the server via **HTTP**
- How the server streams AI responses in real-time via **Server-Sent Events (SSE)**
- How file uploads work in the browser (the **FileReader API**)
- Two different approaches to building UIs: **vanilla JavaScript** vs **React**

> Want to actually run the chatbot? See [README.md](README.md) for setup instructions.

---

## 1. What You See: The User Interface

All three implementations (Gradio, Flask, Next.js) produce the same user experience. Here's what it looks like:

```
+-------------------------------------------------------------+
|  Duke ML Chatbot                       [Clear]  [Settings]  |
+-------------------------------------------------------------+
|                                                              |
|               Welcome to Duke ML Chatbot!                    |
|          Type a message below to start chatting.             |
|                                                              |
|                                    +----------------------+  |
|                                    |  What is ML?         |  |
|                                    +----------------------+  |
|                                                              |
|  +--------------------------------------+                    |
|  |  Machine learning is a branch of     |                    |
|  |  artificial intelligence that lets    |                    |
|  |  computers learn from data without    |                    |
|  |  being explicitly programmed...       |                    |
|  +--------------------------------------+                    |
|                                                              |
+-------------------------------------------------------------+
|  [Attach]  [Type a message...                ]  [Send]       |
+-------------------------------------------------------------+
|  Tokens: 150 in · 42 out · 192 total                        |
+-------------------------------------------------------------+
```

| Region | What it does |
|--------|-------------|
| **Header** | Title bar with Clear and Settings buttons |
| **Message area** | Scrollable list of chat bubbles |
| **User bubbles** | Right-aligned, Duke Blue (#003366) |
| **Assistant bubbles** | Left-aligned, light gray, with Markdown rendering |
| **Input area** | Auto-resizing text box, attach button (paperclip), send button |
| **Settings panel** | Slides in from the right — system instructions, model name, reasoning effort |
| **Token usage bar** | Shows how many tokens the last response used (input/output/total) |

**Key interactions:**

- **Enter** sends the message, **Shift+Enter** adds a new line
- Clicking the **paperclip** opens a file picker (images, PDFs, text files)
- Tokens stream in **one at a time**, creating a real-time typing effect
- The **Settings panel** lets you change the system instructions, model, and reasoning effort without restarting

---

## 2. The Big Picture: Client-Server Architecture

In Levels 1 and 2, your Python script did everything — it read input, called the API, and printed output. All in one program.

In a web app, that work is split between **two separate programs**:

```
LEVELS 1-2 (Terminal)                   LEVEL 3 (Web)

+---------------------+                +------------+       +------------+
|   Your Script       |                |  Browser   |       |  Server    |
|                     |                |  (client)  | <---> |  (backend) |
|  - Reads input      |                |            |       |            |
|  - Calls the API    |                |  - Shows   |       |  - Calls   |
|  - Prints output    |                |    the UI  |       |    the API |
+---------------------+                +------------+       +------------+
                                              ^                    |
                                              |                    v
                                              |           +----------------+
                                              |           | Azure AI       |
                                              |           | Foundry        |
                                              |           +----------------+
```

**Why split them?**

1. **Security.** Your API key must stay secret. Browser code is visible to anyone who opens DevTools — if the API key were in the browser, anyone could steal it. The server keeps it safe.

2. **Language constraints.** Browsers run JavaScript, not Python. The server lets you use whatever language you want (Python for Flask/Gradio, Node.js for Next.js).

> **Key idea:** The server acts as a secure middleman. The browser never sees your API key — it only talks to your server, and your server talks to Azure.

---

## 3. HTTP Requests: How the Browser Talks to the Server

In Levels 1-2, you called the API directly with `client.responses.create()`. In a web app, the browser can't do that (no API key, remember?). Instead, it sends an **HTTP request** to your server.

Think of an HTTP request as a **function call across the network**:

```
Browser sends:

  POST /api/chat                              <-- "which function to call"
  Content-Type: application/json              <-- "I'm sending JSON"

  {                                           <-- "the arguments"
    "message": "What is machine learning?",
    "previousResponseId": "resp_abc123",
    "instructions": "Be concise.",
    "model": "gpt-5.2",
    "reasoningEffort": "low"
  }
```

| Concept | What it means |
|---------|--------------|
| **Method** (`POST`) | The type of action — POST means "send data to the server" |
| **URL** (`/api/chat`) | Which endpoint to hit — like a function name |
| **Headers** | Metadata — here, telling the server the body is JSON |
| **Body** | The actual data — the message, settings, and conversation ID |

Here's how the browser sends this request (from `flask/static/app.js`):

```javascript
const response = await fetch("api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        message:            text,
        previousResponseId: previousResponseId,
        instructions:       instructionsInput.value,
        model:              modelInput.value,
        reasoningEffort:    reasoningEffortSel.value,
    }),
});
```

And here's how the server receives it (from `flask/app.py`):

```python
@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    message = data.get("message", "")
    previous_response_id = data.get("previousResponseId")
    # ... then call Azure AI Foundry with these values
```

> **Connection to Level 1:** Notice `previousResponseId` — it's the same conversation chaining concept from your terminal chatbot! The browser stores it after each response and sends it with the next message.

---

## 4. Server-Sent Events (SSE): Streaming in the Browser

In Level 1B, you added streaming to your terminal chatbot — iterating over events in a `for` loop and printing each text chunk as it arrived. But how does streaming work in the browser?

A normal HTTP response arrives **all at once** — the browser waits until the entire response is ready, then displays it. That would mean the user stares at a loading spinner until the full answer is written. Not great.

**Server-Sent Events (SSE)** solve this. An SSE response is like a normal HTTP response that **keeps sending data** until the server says it's done:

```
Normal HTTP Response:              SSE Response:

+---------------------+            +-------------------------------------+
| Here is the entire  |            |  data: {"type":"delta",             |
| answer all at once. |            |         "text":"Machine"}           | <-- arrives first
| The user waits      |            |                                     |
| until this is       |            |  data: {"type":"delta",             |
| completely done.    |            |         "text":" learning"}         | <-- arrives next
+---------------------+            |                                     |
                                   |  data: {"type":"delta",             |
                                   |         "text":" is a..."}          | <-- keeps going
                                   |                                     |
                                   |  data: {"type":"done",              |
                                   |         "responseId":"resp_abc123"} | <-- done!
                                   +-------------------------------------+
```

### The SSE format

Each event follows a simple format — a `data:` prefix, followed by JSON, followed by two newlines:

```
data: {"type":"delta","text":"Hello"}\n\n
data: {"type":"delta","text":" world"}\n\n
data: {"type":"done","responseId":"resp_xyz789"}\n\n
```

This chatbot uses three event types:

| Event type | Example payload | What it means |
|-----------|----------------|---------------|
| `delta` | `{"type":"delta","text":"Hello"}` | A chunk of text arrived — append it to the message |
| `usage` | `{"type":"usage","inputTokens":150,"outputTokens":42,"totalTokens":192}` | Token counts for this response |
| `done` | `{"type":"done","responseId":"resp_abc123"}` | Stream complete — save the response ID for next turn |

### Server side: sending SSE events

The server iterates over the Azure stream (just like Level 1B) and forwards each chunk as an SSE event. From `flask/app.py`:

```python
def generate():
    stream = client.responses.create(
        model=model,
        input=api_input,
        instructions=instructions,
        stream=True,
    )

    for event in stream:
        if event.type == "response.output_text.delta":
            # Forward each text chunk to the browser immediately
            payload = json.dumps({"type": "delta", "text": event.delta})
            yield f"data: {payload}\n\n"

        elif event.type == "response.completed":
            payload = json.dumps({"type": "done", "responseId": event.response.id})
            yield f"data: {payload}\n\n"
```

### Browser side: reading SSE events

The browser reads the SSE stream chunk by chunk using a `ReadableStream` reader. From `flask/static/app.js`:

```javascript
const reader  = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";  // Accumulates partial event blocks between chunks

while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Decode bytes to text and add to our buffer.
    // Network chunks can split an SSE event in half, so we can't just
    // parse each chunk independently -- we need to buffer.
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank lines (\n\n).
    // Split on them, but keep the last piece in the buffer --
    // it might be an incomplete event waiting for more data.
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";   // Keep the trailing fragment

    // Process only the complete events
    for (const eventBlock of parts) {
        const event = parseSseEventBlock(eventBlock);
        if (!event) continue;

        if (event.type === "delta") {
            assistantEl.textContent += event.text;   // Append text to the bubble
        }
        if (event.type === "done") {
            previousResponseId = event.responseId;   // Save for next turn
        }
    }
}
```

> **Why the buffer?** `reader.read()` returns data at arbitrary network boundaries — a single SSE event like `data: {"type":"delta","text":"Hello"}\n\n` could be split across two reads. Without the buffer, you'd try to parse half a JSON string and lose that chunk. The `parts.pop()` trick keeps any trailing fragment until the next read completes it.

> **Why not WebSockets?** WebSockets are bidirectional — both the client and server can send data at any time. SSE is simpler and one-directional (server to client only), which is perfect for streaming AI responses. The browser sends one request; the server streams back the answer. No need for the complexity of WebSockets.

---

## 5. File Uploads: Browser-Side Base64 Encoding

In Level 2, you used Python's `base64.b64encode()` to read files from disk. In the browser, JavaScript uses the **FileReader API** instead — same concept, different tool.

Here's the flow:

```
User clicks "Attach" button
  │
  v
Hidden <input type="file"> opens the OS file picker
  │
  v
User selects a file (image, PDF, text, etc.)
  │
  v
JavaScript reads the file with FileReader.readAsDataURL()
  │
  v
Result: "data:image/png;base64,iVBOR..."    <-- same data URI format as Level 2!
  │
  v
Stored in memory until the user clicks Send
  │
  v
Sent as part of the POST /api/chat JSON body
```

From `flask/static/app.js`:

```javascript
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        // Store the file data for sending with the next message
        attachedFile = {
            name: file.name,
            data: reader.result,  // "data:application/pdf;base64,..."
        };
    };
    reader.readAsDataURL(file);   // Triggers the onload callback when done
});
```

> **Connection to Level 2:** The data URI format (`data:image/png;base64,iVBOR...`) is the same one you used in Level 2. The only difference is *who* does the encoding — Python in Level 2, the browser's FileReader in Level 3.

---

## 6. Two Ways to Build a UI: DOM vs React

The Level 3 code includes two different approaches to building the same chat interface. Neither is "better" — they're different tools for different situations.

### Vanilla JavaScript + DOM Manipulation (Flask version)

The **DOM** (Document Object Model) is the browser's internal representation of the HTML page. Vanilla JS directly creates and modifies HTML elements.

To add a new message bubble, you grab pieces and assemble them yourself:

```javascript
// From flask/static/app.js

function addMessage(role, text) {
    const el = document.createElement("div");   // Create a new <div>
    el.classList.add("message", role);           // Add CSS classes
    el.appendChild(document.createTextNode(text)); // Set the text
    messagesContainer.appendChild(el);           // Add it to the page
}
```

To update streaming text, you modify the element directly:

```javascript
assistantEl.textContent += event.text;   // Append each chunk
```

> Think of it like assembling furniture by hand — you grab each piece and attach it yourself.

### React + State Management (Next.js version)

React takes a different approach. You describe **what the UI should look like** for a given state, and React figures out what DOM changes are needed.

To add a message, you update the state — React re-renders automatically:

```typescript
// From nextjs/src/hooks/use-chat.ts

setMessages(prev => [...prev, { role: "user", content: text }]);
```

You never touch the DOM directly. Instead, a JSX template maps state to UI:

```tsx
// From nextjs/src/components/message-list.tsx

{messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
```

> Think of it like ordering pre-assembled furniture — you describe what you want, and the framework builds it.

### Side-by-side comparison

| Concept | Vanilla JS (Flask) | React (Next.js) |
|---------|-------------------|-----------------|
| Add a message | `document.createElement()` + `appendChild()` | `setMessages([...prev, newMsg])` |
| Update streaming text | `el.textContent += delta` | `setMessages(prev => prev.map(...))` |
| Track conversation ID | `let previousResponseId = null` | `useState(null)` |
| Show/hide settings | `classList.add("open")` | `useState(false)` + conditional render |
| File to base64 | `FileReader` in event listener | `FileReader` in async function |

### Component architecture (Next.js)

React encourages splitting the UI into **components** — small, reusable pieces that each handle one thing:

```
ChatInterface (main orchestrator)
  +-- Header (title, settings button, clear button)
  +-- MessageList (scrollable message area)
  |     +-- MessageBubble (one per message)
  |           +-- ReactMarkdown (renders formatting in assistant messages)
  |           +-- TypingIndicator (animated bouncing dots)
  +-- ChatInput (textarea, attach button, send button)
  |     +-- FilePreview (shows attached file before sending)
  +-- SettingsPanel (slide-out drawer)
```

Each box is a separate file. Data flows **down** from parent to child via props. When state changes at the top, React efficiently updates only the parts of the UI that need to change.

---

## 7. Gradio: The Shortcut

Gradio takes a radically different approach — it handles **both** the client and server in a single Python file. No separate JavaScript, HTML, or CSS.

Where Flask needs 4 files (`app.py` + `app.js` + `index.html` + `style.css`) and Next.js needs 5+ component files, Gradio is just one `app.py`.

Streaming works via a Python **generator** — the same `yield` keyword you saw in Level 1B:

```python
# From gradio/app.py

for event in stream:
    if event.type == "response.output_text.delta":
        history[-1]["content"] += event.delta
        yield history, prev_id       # Gradio updates the UI on each yield
```

Gradio builds the UI from Python components:

```python
chatbot = gr.Chatbot(height=500)
chat_input = gr.MultimodalTextbox(placeholder="Type a message...")

with gr.Accordion("Settings", open=False):
    instructions_input = gr.Textbox(value=INSTRUCTIONS, label="System Instructions")
    model_input = gr.Textbox(value=MODEL, label="Model")
    effort_input = gr.Dropdown(choices=["low", "medium", "high"], label="Reasoning Effort")
```

> **Trade-off:** Gradio is great for quick prototypes and internal tools — you get a full chat UI in ~100 lines of Python. Flask and Next.js give you full control over every pixel of the design, but require significantly more code and web development knowledge.

---

## 8. Putting It All Together: The Full Journey of a Message

Let's trace one complete interaction through all the layers:

```
1. USER types "What is ML?" and clicks Send
   │
   v
2. BROWSER reads the textarea value
   - Adds a blue user bubble to the chat: "What is ML?"
   - Shows the typing indicator (three bouncing dots)
   - Clears the text input
   │
   v
3. BROWSER  ──>  SERVER:  POST /api/chat
   {
     "message": "What is ML?",
     "previousResponseId": null,        <-- first message, no history
     "instructions": "Be concise.",
     "model": "gpt-5.2",
     "reasoningEffort": "low"
   }
   │
   v
4. SERVER receives the JSON and calls Azure:
   client.responses.create(
       model="gpt-5.2",
       input="What is ML?",
       instructions="Be concise.",
       stream=True
   )
   │
   v
5. AZURE  ──>  SERVER:  stream of response chunks
   "Machine" -> " learning" -> " is" -> " a" -> " branch" -> " of" -> ...
   │
   v
6. SERVER  ──>  BROWSER:  SSE stream
   data: {"type":"delta","text":"Machine"}
   data: {"type":"delta","text":" learning"}
   data: {"type":"delta","text":" is"}
   ...
   data: {"type":"usage","inputTokens":150,"outputTokens":42,"totalTokens":192}
   data: {"type":"done","responseId":"resp_abc123"}
   │
   v
7. BROWSER updates the UI in real-time:
   - Removes the typing indicator
   - Creates a gray assistant bubble
   - Appends each delta to the bubble as it arrives (typing effect!)
   - Updates the token usage bar
   - Stores "resp_abc123" for the next message
   │
   v
8. NEXT MESSAGE will include previousResponseId: "resp_abc123"
   so Azure knows the conversation history (no need to resend it!)
```

---

## 9. Glossary

| Term | Definition |
|------|-----------|
| **Client** | The browser (or any program that makes requests to a server) |
| **Server** | The backend program that handles requests and talks to external APIs |
| **HTTP** | The protocol browsers use to communicate with servers |
| **POST** | An HTTP method for sending data to a server (vs GET which retrieves data) |
| **SSE** | Server-Sent Events — a protocol for streaming data from server to client over HTTP |
| **DOM** | Document Object Model — the browser's live representation of the HTML page |
| **Base64** | A way to encode binary data (images, PDFs) as text so it can travel in JSON |
| **MIME type** | A label identifying a file's format, like `image/png` or `application/pdf` |
| **Component** | A reusable, self-contained piece of UI (a React concept) |
| **State** | Data that, when changed, causes the UI to update automatically (a React concept) |
| **Data URI** | A string that embeds file data inline: `data:image/png;base64,iVBOR...` |
| **Props** | Data passed from a parent component to a child component (React) |

---

## 10. Want to Learn More?

These resources go deeper on the concepts introduced above:

- **MDN Web Docs** — The definitive reference for web APIs:
  - [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) — How browsers make HTTP requests
  - [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) — The SSE protocol
  - [FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader) — Reading files in the browser
- **React** — [Thinking in React](https://react.dev/learn/thinking-in-react) — The core mental model for building React UIs
- **Flask** — [Quickstart](https://flask.palletsprojects.com/en/stable/quickstart/) — Build a Python web server in 10 minutes
- **Gradio** — [Quickstart](https://www.gradio.app/guides/quickstart) — Build a UI with pure Python
