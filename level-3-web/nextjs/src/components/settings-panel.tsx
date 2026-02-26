/**
 * =============================================================
 * SettingsPanel Component
 * =============================================================
 * A slide-out panel for configuring chat settings:
 *   - System instructions (the AI's personality/rules)
 *   - Model name (which Azure deployment to use)
 *   - Reasoning effort (how hard the model thinks)
 *
 * The panel slides in from the right when the user clicks
 * the settings gear icon in the header.
 *
 * DESIGN DECISION:
 * We use a simple div with CSS transitions instead of a
 * full dialog/sheet library. This keeps dependencies minimal
 * while still providing a smooth, polished feel.
 * =============================================================
 */

"use client";

import { X, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatSettings } from "@/hooks/use-chat";

interface SettingsPanelProps {
  /** Whether the panel is visible */
  isOpen: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** Current settings values */
  settings: ChatSettings;
  /** Callback when any setting changes */
  onSettingsChange: (settings: ChatSettings) => void;
}

export function SettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: SettingsPanelProps) {
  /**
   * Helper to update a single setting field.
   * Spreads the existing settings and overrides the changed field.
   */
  const updateSetting = (key: keyof ChatSettings, value: string) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <>
      {/* --------------------------------------------------
       * Backdrop overlay
       * Clicking it closes the panel (common UX pattern)
       * -------------------------------------------------- */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* --------------------------------------------------
       * Slide-out panel
       * Uses CSS transform to slide in from the right.
       * translate-x-0 = visible, translate-x-full = hidden.
       * -------------------------------------------------- */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-card border-l border-border shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Settings</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Panel content - scrollable if it overflows */}
        <div className="p-4 space-y-6 overflow-y-auto h-[calc(100%-65px)]">
          {/* -----------------------------------------------
           * System Instructions
           * -----------------------------------------------
           * This is the "personality" of the AI. It's sent
           * as the `instructions` parameter to the Responses API.
           * Examples: "You are a pirate", "Answer in haiku only"
           * ----------------------------------------------- */}
          <div className="space-y-2">
            <label
              htmlFor="instructions"
              className="text-sm font-medium text-foreground"
            >
              System Instructions
            </label>
            <p className="text-xs text-muted-foreground">
              Define the AI&apos;s personality and behavior rules.
            </p>
            <textarea
              id="instructions"
              value={settings.instructions || ""}
              onChange={(e) => updateSetting("instructions", e.target.value)}
              placeholder="You are a helpful assistant. Be concise and friendly."
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* -----------------------------------------------
           * Model Name
           * -----------------------------------------------
           * The Azure deployment name. Must match what's
           * configured in your Azure AI Foundry resource.
           * ----------------------------------------------- */}
          <div className="space-y-2">
            <label
              htmlFor="model"
              className="text-sm font-medium text-foreground"
            >
              Model
            </label>
            <p className="text-xs text-muted-foreground">
              Azure model deployment name.
            </p>
            <input
              id="model"
              type="text"
              value={settings.model || ""}
              onChange={(e) => updateSetting("model", e.target.value)}
              placeholder="gpt-4o"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* -----------------------------------------------
           * Reasoning Effort
           * -----------------------------------------------
           * Controls how much "thinking" the model does:
           *   - low:    Fast, cheaper, less thorough
           *   - medium: Balanced
           *   - high:   Slower, more expensive, most thorough
           * ----------------------------------------------- */}
          <div className="space-y-2">
            <label
              htmlFor="reasoning"
              className="text-sm font-medium text-foreground"
            >
              Reasoning Effort
            </label>
            <p className="text-xs text-muted-foreground">
              Higher effort = more thorough but slower responses.
            </p>
            <select
              id="reasoning"
              value={settings.reasoningEffort || "low"}
              onChange={(e) => updateSetting("reasoningEffort", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="low">Low (Fast)</option>
              <option value="medium">Medium (Balanced)</option>
              <option value="high">High (Thorough)</option>
            </select>
          </div>

          {/* Info note at the bottom */}
          <div className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
            <p className="font-medium mb-1">About these settings</p>
            <p>
              Settings are sent with each message. Changing them takes
              effect on the next message you send. Model and reasoning
              defaults come from your .env.local file.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
