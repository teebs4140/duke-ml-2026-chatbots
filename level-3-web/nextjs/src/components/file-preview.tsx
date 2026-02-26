/**
 * =============================================================
 * FilePreview Component
 * =============================================================
 * Shows a small card above the chat input when a file is
 * attached. Displays the filename and a remove button so the
 * user can detach the file before sending.
 *
 * This provides visual feedback that the file was successfully
 * selected - without it, users wouldn't know if their file
 * attachment worked.
 * =============================================================
 */

"use client";

import { X, FileText, ImageIcon } from "lucide-react";

interface FilePreviewProps {
  /** The attached file object */
  file: File;
  /** Callback to remove the file attachment */
  onRemove: () => void;
}

export function FilePreview({ file, onRemove }: FilePreviewProps) {
  // Determine if the file is an image to show the right icon
  const isImage = file.type.startsWith("image/");

  // Format file size for display (e.g., "2.4 MB")
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm">
      {/* File type icon */}
      {isImage ? (
        <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : (
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      )}

      {/* Filename and size */}
      <div className="flex flex-col min-w-0">
        <span className="truncate font-medium">{file.name}</span>
        <span className="text-xs text-muted-foreground">
          {formatSize(file.size)}
        </span>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="ml-auto shrink-0 rounded-full p-1 hover:bg-muted transition-colors"
        aria-label="Remove attached file"
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}
