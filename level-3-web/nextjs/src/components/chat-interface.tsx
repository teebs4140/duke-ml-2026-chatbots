/**
 * =============================================================
 * ChatInterface Component - Main Orchestrator
 * =============================================================
 * This is the top-level component that brings everything together.
 * It composes all the chat sub-components and manages the
 * settings panel state.
 *
 * COMPONENT TREE:
 *   ChatInterface
 *     +-- Header (title, settings button, clear button)
 *     +-- MessageList (scrollable message area)
 *     +-- ChatInput (text input, file attach, send)
 *     +-- SettingsPanel (slide-out settings drawer)
 *
 * STATE MANAGEMENT:
 *   - Chat state (messages, loading, etc.) lives in useChat()
 *   - Settings state lives here since it's UI-specific
 *   - Settings panel open/close state is local
 *
 * The useChat hook handles all the heavy lifting (API calls,
 * streaming, conversation chaining). This component just
 * wires the hook's state and actions to the UI components.
 * =============================================================
 */

"use client";

import { useState, useCallback } from "react";
import { Settings, Trash2, Bot } from "lucide-react";
import { useChat, type ChatSettings } from "@/hooks/use-chat";
import { MessageList } from "@/components/message-list";
import { ChatInput } from "@/components/chat-input";
import { SettingsPanel } from "@/components/settings-panel";
import { Button } from "@/components/ui/button";

export function ChatInterface() {
  // -------------------------------------------------------
  // Chat Hook - provides messages, loading state, and actions
  // -------------------------------------------------------
  const { messages, isLoading, error, usage, sendMessage, clearChat } = useChat();

  // -------------------------------------------------------
  // Local State - UI-specific settings
  // -------------------------------------------------------

  /** Whether the settings panel is open */
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  /** Current chat settings (instructions, model, reasoning) */
  const [settings, setSettings] = useState<ChatSettings>({
    instructions: "",
    model: "",
    reasoningEffort: "low",
  });

  /**
   * Handle sending a message.
   * Passes the settings along with the message so the API
   * route can use them for the request.
   */
  const handleSend = useCallback(
    (text: string, file?: File | null) => {
      sendMessage(text, file, settings);
    },
    [sendMessage, settings]
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* =====================================================
       * Header
       * =====================================================
       * Fixed at the top with the app title and action buttons.
       * Duke Blue background with white text for branding.
       * ===================================================== */}
      <header className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground shadow-md">
        <div className="flex items-center gap-3">
          {/* Bot icon */}
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-white/10">
            <Bot className="h-5 w-5" />
          </div>

          {/* Title and subtitle */}
          <div>
            <h1 className="text-lg font-semibold leading-tight">
              Duke ML Chatbot
            </h1>
            <p className="text-xs text-primary-foreground/70">
              Powered by Azure AI Foundry
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {/* Clear chat button - only shown when there are messages */}
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearChat}
              className="text-primary-foreground hover:bg-white/10"
              title="Clear chat"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          )}

          {/* Settings button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSettingsOpen(true)}
            className="text-primary-foreground hover:bg-white/10"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* =====================================================
       * Error Banner
       * =====================================================
       * Shown at the top of the message area when there's an
       * error. Provides clear feedback about what went wrong.
       * ===================================================== */}
      {error && (
        <div className="mx-4 mt-4 max-w-3xl self-center w-full">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-medium">Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* =====================================================
       * Message List
       * =====================================================
       * Takes up all remaining vertical space (flex-1).
       * Scrolls internally when messages overflow.
       * ===================================================== */}
      <MessageList messages={messages} isLoading={isLoading} />

      {/* =====================================================
       * Chat Input
       * =====================================================
       * Fixed at the bottom. Contains the textarea, file
       * attach button, and send button.
       * ===================================================== */}
      <ChatInput onSend={handleSend} isLoading={isLoading} />

      {/* =====================================================
       * Token Usage Status Bar
       * =====================================================
       * Small bar below the input showing token counts from
       * the last response. Helps students understand context
       * window consumption and API costs.
       * ===================================================== */}
      {usage && (
        <div className="flex justify-center px-4 py-1.5 text-xs text-muted-foreground bg-muted/50 border-t">
          <span>
            Tokens: {usage.inputTokens.toLocaleString()} in &middot; {usage.outputTokens.toLocaleString()} out &middot; {usage.totalTokens.toLocaleString()} total
          </span>
        </div>
      )}

      {/* =====================================================
       * Settings Panel (Slide-out)
       * =====================================================
       * Rendered always but hidden off-screen when closed.
       * Slides in from the right when opened.
       * ===================================================== */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
}
