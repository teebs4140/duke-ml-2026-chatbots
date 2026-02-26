/**
 * Level 3: Flask Web Chat - Client-Side JavaScript
 * ==================================================
 * This file handles all browser-side logic for the chat UI.
 * It uses plain (vanilla) JavaScript -- no frameworks like React or Vue.
 *
 * Key concepts you'll learn:
 *   - DOM manipulation (adding elements, updating text)
 *   - Fetch API with streaming (ReadableStream + TextDecoder)
 *   - Server-Sent Events (SSE) parsing
 *   - FileReader API for converting files to base64
 *   - Event listeners for user interaction
 *
 * Architecture:
 *   User types message
 *     -> sendMessage() posts to /api/chat
 *     -> Server streams back SSE events
 *     -> We parse each event and update the DOM in real-time
 *     -> When "done" event arrives, we store the responseId for next turn
 */

// =====================================================================
// Step 1: Grab references to all the DOM elements we'll interact with
// =====================================================================
// It's good practice to collect these at the top so they're easy to find.

const messagesContainer = document.getElementById("messages");
const messageInput      = document.getElementById("message-input");
const sendBtn           = document.getElementById("send-btn");
const attachBtn         = document.getElementById("attach-btn");
const fileInput         = document.getElementById("file-input");
const inputFilePreview  = document.getElementById("input-file-preview");
const fileNameDisplay   = document.getElementById("file-name-display");
const removeFileBtn     = document.getElementById("remove-file-btn");
const settingsBtn       = document.getElementById("settings-btn");
const settingsOverlay   = document.getElementById("settings-overlay");
const settingsPanel     = document.getElementById("settings-panel");
const closeSettingsBtn  = document.getElementById("close-settings");
const clearBtn          = document.getElementById("clear-btn");
const welcomeMessage    = document.getElementById("welcome-message");

// Settings inputs
const instructionsInput   = document.getElementById("settings-instructions");
const modelInput          = document.getElementById("settings-model");
const reasoningEffortSel  = document.getElementById("settings-reasoning");
const chatApiToken        = window.CHAT_API_TOKEN || "";

// =====================================================================
// Step 2: Application state
// =====================================================================
// We track the previous response ID for conversation chaining, the
// currently attached file, and whether we're waiting for a response.

let previousResponseId = null;  // Links each message to the conversation history
let attachedFile       = null;  // { name: "file.pdf", data: "data:...;base64,..." }
let isStreaming        = false;  // Prevents sending while a response is in progress
let activeAbortController = null;
let streamGeneration = 0;

// =====================================================================
// Step 3: sendMessage() -- the core function
// =====================================================================
/**
 * Sends the user's message to the Flask backend and streams the response.
 *
 * Flow:
 *   1. Read the input text and validate it
 *   2. Add the user's message to the chat UI
 *   3. Show a typing indicator
 *   4. POST to /api/chat with the message + settings
 *   5. Read the SSE stream chunk by chunk
 *   6. Parse each SSE line and update the assistant message in real-time
 *   7. When done, store the response ID for conversation continuity
 */
async function sendMessage() {
    // --- 3a. Get and validate the input ---
    const text = messageInput.value.trim();
    if ((!text && !attachedFile) || isStreaming) return;

    // --- 3b. Clear the input and disable the send button ---
    messageInput.value = "";
    messageInput.style.height = "auto";  // Reset textarea height
    isStreaming = true;
    sendBtn.disabled = true;

    // Hide the welcome message once the conversation starts
    if (welcomeMessage) {
        welcomeMessage.style.display = "none";
    }

    // --- 3c. Add the user's message to the chat ---
    // --- 3d. Capture the attached file and then clear it ---
    const fileToSend = attachedFile;
    const userMessageText = text || (fileToSend ? `Uploaded a file: ${fileToSend.name}` : "");
    addMessage("user", userMessageText, attachedFile);
    clearAttachedFile();

    // --- 3e. Show the typing indicator while waiting ---
    const typingEl = showTypingIndicator();

    // --- 3f. Build the request payload ---
    const payload = {
        message:            text,
        previousResponseId: previousResponseId,
        instructions:       instructionsInput.value,
        model:              modelInput.value,
        reasoningEffort:    reasoningEffortSel.value,
    };

    // Include the file if one is attached
    if (fileToSend) {
        payload.file = fileToSend;
    }

    const controller = new AbortController();
    activeAbortController = controller;
    const generationId = streamGeneration + 1;
    streamGeneration = generationId;

    try {
        // --- 3g. Send the POST request ---
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(chatApiToken ? { "X-Chat-Token": chatApiToken } : {}),
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        if (!response.ok) {
            let errorMessage = `Server error: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                if (errorData && typeof errorData.error === "string") {
                    errorMessage = errorData.error;
                }
            } catch {
                // Ignore JSON parse failures and use the fallback status text
            }
            throw new Error(errorMessage);
        }

        if (!response.body) {
            throw new Error("No response stream available");
        }

        // --- 3h. Remove the typing indicator and create the assistant message ---
        typingEl.remove();
        const assistantEl = addMessage("assistant", "");

        // --- 3i. Read the SSE stream using a ReadableStream reader ---
        // This is the modern way to consume streaming responses in the browser.
        // We read chunks of bytes, decode them to text, and parse SSE lines.
        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";  // Accumulates partial event blocks between chunks

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                buffer += decoder.decode();
                const trailingEvents = buffer.split("\n\n").map((event) => event.trim()).filter(Boolean);
                for (const eventBlock of trailingEvents) {
                    if (generationId !== streamGeneration) continue;
                    const dataLines = eventBlock
                        .split("\n")
                        .filter((line) => line.startsWith("data:"))
                        .map((line) => line.slice(5).trimStart());
                    if (dataLines.length === 0) continue;

                    let event;
                    try {
                        event = JSON.parse(dataLines.join("\n"));
                    } catch {
                        continue;
                    }

                    if (event.type === "usage") {
                        updateUsageDisplay(event.inputTokens, event.outputTokens, event.totalTokens);
                    } else if (event.type === "done" && event.responseId) {
                        previousResponseId = event.responseId;
                    } else if (event.type === "error") {
                        throw new Error(event.message || event.text || "Streaming error");
                    }
                }
                break;
            }

            // Decode the binary chunk to a string and add to our buffer
            buffer += decoder.decode(value, { stream: true });

            // SSE events are separated by blank lines (\n\n)
            const eventBlocks = buffer.split("\n\n");
            buffer = eventBlocks.pop() || "";

            for (const eventBlock of eventBlocks) {
                if (generationId !== streamGeneration) continue;

                const dataLines = eventBlock
                    .split("\n")
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trimStart());
                if (dataLines.length === 0) continue;

                let event;
                try {
                    event = JSON.parse(dataLines.join("\n"));
                } catch {
                    continue;  // Skip malformed event blocks
                }

                // Handle the different event types from our Flask backend
                if (event.type === "delta") {
                    // A new chunk of text -- append it to the assistant message
                    assistantEl.textContent += event.text;
                    scrollToBottom();
                } else if (event.type === "usage") {
                    // Token usage stats -- display in the status bar
                    updateUsageDisplay(event.inputTokens, event.outputTokens, event.totalTokens);
                } else if (event.type === "done") {
                    // The response is complete -- save the ID for next turn
                    previousResponseId = event.responseId;
                } else if (event.type === "error") {
                    // The server encountered an error
                    throw new Error(event.message || event.text || "Streaming error");
                }
            }
        }
    } catch (error) {
        if (error && error.name === "AbortError") {
            return;
        }

        // --- 3j. Handle network or fetch errors ---
        typingEl.remove();
        addMessage("error", "Failed to send message: " + error.message);
    } finally {
        if (activeAbortController === controller) {
            activeAbortController = null;
        }
        if (generationId === streamGeneration) {
            // --- 3k. Re-enable the input ---
            isStreaming = false;
            sendBtn.disabled = false;
            messageInput.focus();
        }
    }
}

// =====================================================================
// Step 4: DOM helper functions
// =====================================================================

/**
 * Adds a message bubble to the chat area.
 *
 * @param {string} role  - "user", "assistant", or "error"
 * @param {string} text  - The message text
 * @param {object} file  - Optional file attachment {name, data}
 * @returns {HTMLElement} - The created message element (for later updates)
 */
function addMessage(role, text, file) {
    const el = document.createElement("div");
    el.classList.add("message", role);

    // If this is a user message with an attached file, show a file preview.
    // We use textContent (not innerHTML) so file names are safely escaped.
    if (file && role === "user") {
        const preview = document.createElement("div");
        preview.classList.add("file-preview");

        const iconSpan = document.createElement("span");
        iconSpan.classList.add("file-icon");
        iconSpan.textContent = "\uD83D\uDCCE";  // paperclip unicode character

        const nameSpan = document.createElement("span");
        nameSpan.classList.add("file-name");
        nameSpan.textContent = file.name;  // textContent safely escapes HTML

        preview.appendChild(iconSpan);
        preview.appendChild(nameSpan);
        el.appendChild(preview);
    }

    // Add the text content (using textContent, not innerHTML, for security)
    const textNode = document.createTextNode(text);
    el.appendChild(textNode);

    messagesContainer.appendChild(el);
    scrollToBottom();
    return el;
}

/**
 * Shows the animated typing indicator (three bouncing dots).
 * Returns the element so the caller can remove it later.
 *
 * We build the DOM elements programmatically rather than using innerHTML
 * to follow safe DOM construction practices.
 */
function showTypingIndicator() {
    const el = document.createElement("div");
    el.classList.add("typing-indicator");

    // Create three <span> elements for the bouncing dots
    for (let i = 0; i < 3; i++) {
        el.appendChild(document.createElement("span"));
    }

    messagesContainer.appendChild(el);
    scrollToBottom();
    return el;
}

/**
 * Scrolls the message area to the bottom.
 * Called after every new message or text chunk so the latest content is visible.
 */
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// =====================================================================
// Step 5: File upload handling
// =====================================================================

/**
 * Opens the hidden file input when the attach button is clicked.
 * We use a hidden <input type="file"> because it's easier to style
 * a custom button than the default file input.
 */
attachBtn.addEventListener("click", () => {
    fileInput.click();
});

/**
 * Handles file selection.
 * Uses FileReader.readAsDataURL() to convert the file to a base64 string
 * that we can send to the server as JSON.
 */
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    // Limit file size to 20MB to avoid overwhelming the API
    if (file.size > 20 * 1024 * 1024) {
        alert("File is too large. Maximum size is 20 MB.");
        fileInput.value = "";
        return;
    }

    // Read the file as a data URL (base64-encoded string)
    const reader = new FileReader();
    reader.onload = () => {
        // Store the file data for sending with the next message
        attachedFile = {
            name: file.name,
            data: reader.result,  // "data:application/pdf;base64,..."
            mimeType: file.type || "application/octet-stream",
        };

        // Show the file preview bar above the input
        fileNameDisplay.textContent = file.name;
        inputFilePreview.classList.add("visible");
    };
    reader.readAsDataURL(file);

    // Reset the file input so the same file can be re-selected
    fileInput.value = "";
});

/**
 * Removes the currently attached file.
 */
function clearAttachedFile() {
    attachedFile = null;
    inputFilePreview.classList.remove("visible");
    fileNameDisplay.textContent = "";
}

removeFileBtn.addEventListener("click", clearAttachedFile);

// =====================================================================
// Step 6: Settings panel
// =====================================================================

/** Opens the settings panel with a slide-in animation. */
function openSettings() {
    settingsOverlay.classList.add("open");
    settingsPanel.classList.add("open");
}

/** Closes the settings panel. */
function closeSettings() {
    settingsOverlay.classList.remove("open");
    settingsPanel.classList.remove("open");
}

settingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);

// Close settings when clicking the overlay (outside the panel)
settingsOverlay.addEventListener("click", closeSettings);

// =====================================================================
// Step 7: Clear chat
// =====================================================================

/**
 * Resets the conversation:
 *   - Clears all messages from the UI
 *   - Resets previousResponseId so the next message starts fresh
 *   - Shows the welcome message again
 */
clearBtn.addEventListener("click", () => {
    streamGeneration += 1;
    if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
    }

    // Remove all child elements from the messages container
    while (messagesContainer.firstChild) {
        messagesContainer.removeChild(messagesContainer.firstChild);
    }
    previousResponseId = null;
    clearAttachedFile();
    isStreaming = false;
    sendBtn.disabled = false;

    const usageBar = document.getElementById("usage-bar");
    if (usageBar) {
        usageBar.style.display = "none";
    }

    // Re-show the welcome message
    if (welcomeMessage) {
        messagesContainer.appendChild(welcomeMessage);
        welcomeMessage.style.display = "";
    }
});

// =====================================================================
// Step 8: Keyboard shortcuts and auto-resize
// =====================================================================

/**
 * Handle keyboard input in the textarea:
 *   - Enter (without Shift) sends the message
 *   - Shift+Enter inserts a newline (default textarea behavior)
 */
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();  // Prevent the default newline
        sendMessage();
    }
});

/**
 * Auto-resize the textarea as the user types.
 * Grows up to a max height (set in CSS), then scrolls internally.
 */
messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = messageInput.scrollHeight + "px";
});

// Send button click handler
sendBtn.addEventListener("click", sendMessage);

// =====================================================================
// Step 9: Token usage display
// =====================================================================

/**
 * Update the token usage status bar at the bottom of the chat.
 * This shows how many tokens were used for input and output,
 * helping students understand context window consumption.
 */
function updateUsageDisplay(inputTokens, outputTokens, totalTokens) {
    let usageBar = document.getElementById("usage-bar");
    if (!usageBar) {
        // Create the usage bar if it doesn't exist yet
        usageBar = document.createElement("div");
        usageBar.id = "usage-bar";
        usageBar.className = "usage-bar";
        // Insert after the input area
        const inputArea = document.querySelector(".input-area");
        if (inputArea) {
            inputArea.parentNode.insertBefore(usageBar, inputArea.nextSibling);
        }
    }
    usageBar.textContent = `Tokens: ${inputTokens.toLocaleString()} in · ${outputTokens.toLocaleString()} out · ${totalTokens.toLocaleString()} total`;
    usageBar.style.display = "block";
}
