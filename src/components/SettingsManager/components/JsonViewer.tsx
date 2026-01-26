/**
 * JsonViewer Component
 *
 * Read-only JSON display with syntax highlighting
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface JsonViewerProps {
  content: string | null;
  className?: string;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({
  content,
  className,
}) => {
  const formattedJson = React.useMemo(() => {
    if (!content) return null;
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }, [content]);

  if (!formattedJson) {
    return null;
  }

  return (
    <div className={cn("relative", className)}>
      <pre className="p-4 rounded-lg bg-muted/50 overflow-auto max-h-[600px] text-xs font-mono">
        <code className="text-foreground">{formattedJson}</code>
      </pre>
    </div>
  );
};
