/**
 * =============================================================
 * ChatInput Component
 * =============================================================
 * The message composition area at the bottom of the chat.
 *
 * FEATURES:
 *   - Auto-resizing textarea (grows as you type, up to a max)
 *   - File attachment via hidden <input type="file">
 *   - FilePreview shown above input when a file is selected
 *   - Enter to send, Shift+Enter for newline
 *   - Disabled state while the AI is responding
 *   - Send button with icon
 *
 * KEYBOARD SHORTCUTS:
 *   Enter         -> Send the message
 *   Shift+Enter   -> Insert a newline (for multi-line messages)
 *
 * WHY A HIDDEN FILE INPUT?
 * The native <input type="file"> is ugly and hard to style.
 * Instead, we hide it and trigger it programmatically when
 * the user clicks our styled paperclip button. The hidden
 * input still handles the OS file picker dialog.
 * =============================================================
 */

"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/file-preview";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

interface ChatInputProps {
  /** Called when the user sends a message */
  onSend: (message: string, file?: File | null) => void;
  /** Whether the chat is currently processing (disables input) */
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  /** The current text in the textarea */
  const [input, setInput] = useState("");

  /** The currently attached file (null if none) */
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  /** Ref to the hidden file input element */
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Ref to the textarea for auto-resizing */
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Handle sending the message.
   * Clears the input and file attachment after sending.
   */
  const handleSend = useCallback(() => {
    const trimmedInput = input.trim();

    // Don't send if empty and no file attached
    if (!trimmedInput && !attachedFile) return;

    // Call the parent's onSend with the message and optional file
    onSend(trimmedInput, attachedFile);

    // Reset input state
    setInput("");
    setAttachedFile(null);

    // Reset textarea height back to default
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, attachedFile, onSend]);

  /**
   * Handle keyboard events in the textarea.
   * Enter sends, Shift+Enter inserts a newline.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // Prevent the default newline insertion
      e.preventDefault();
      // Send the message (if not loading)
      if (!isLoading) {
        handleSend();
      }
    }
  };

  /**
   * Auto-resize the textarea as the user types.
   * We reset height to "auto" first (to shrink if text was deleted),
   * then set it to scrollHeight (the content's natural height).
   * Max height is capped in CSS to prevent it from growing forever.
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    // Auto-resize
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  /**
   * Handle file selection from the OS file picker.
   * Triggered when the hidden <input type="file"> changes.
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        alert("File is too large. Maximum size is 20 MB.");
        e.target.value = "";
        return;
      }
      setAttachedFile(file);
    }
    // Reset the input value so the same file can be re-selected
    e.target.value = "";
  };

  return (
    <div className="border-t border-border bg-card p-4">
      <div className="max-w-3xl mx-auto">
        {/* File preview - shown above the input when a file is attached */}
        {attachedFile && (
          <div className="mb-2">
            <FilePreview
              file={attachedFile}
              onRemove={() => setAttachedFile(null)}
            />
          </div>
        )}

        {/* Main input row: attach button + textarea + send button */}
        <div className="flex items-end gap-2">
          {/* -----------------------------------------------
           * File Attach Button
           * Clicking this triggers the hidden file input.
           * The paperclip icon is a universal "attach" metaphor.
           * ----------------------------------------------- */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="shrink-0 mb-0.5"
            aria-label="Attach a file"
          >
            <Paperclip className="h-5 w-5" />
          </Button>

          {/* Hidden file input - triggered by the attach button */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
            accept="image/*,.pdf,.txt,.md,.csv,.json,.py,.js,.ts,.html,.css"
          />

          {/* -----------------------------------------------
           * Message Textarea
           * Auto-resizes vertically as the user types.
           * min-height: 1 row, max-height: ~200px.
           * ----------------------------------------------- */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isLoading ? "Waiting for response..." : "Type a message..."
            }
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ maxHeight: "200px" }}
          />

          {/* -----------------------------------------------
           * Send Button
           * Disabled when loading or when input is empty.
           * Uses the primary (Duke Blue) color.
           * ----------------------------------------------- */}
          <Button
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && !attachedFile)}
            size="icon"
            className="shrink-0 mb-0.5 rounded-xl"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>

        {/* Hint text below the input */}
        <p className="mt-2 text-xs text-center text-muted-foreground">
          Press Enter to send, Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}
