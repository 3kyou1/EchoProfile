/**
 *
 *
 * - Bash: command + description → stdout/stderr
 * - Read: file_path (range) → file content
 * - Grep: pattern + path → search results
 * - Glob: pattern + path → file list
 * - Agent: subagent_type + description + prompt(md) → result(md)
 * - Default: primary field → result text
 */

import { memo } from "react";
import {
  BashCard,
  ReadCard,
  EditCard,
  WriteCard,
  GrepCard,
  GlobCard,
  WebSearchCard,
  WebFetchCard,
  AgentCard,
  DefaultCard,
} from "./unifiedCards";
import type { Props } from "./unifiedCards";

export type { Props as UnifiedToolExecutionRendererProps };

export const UnifiedToolExecutionRenderer = memo(function UnifiedToolExecutionRenderer({
  toolUse,
  toolResults,
  onViewSubagent,
}: Props) {
  const toolName = (toolUse.name as string) || "";

  switch (toolName) {
    case "Bash":      return <BashCard toolUse={toolUse} toolResults={toolResults} />;
    case "Read":      return <ReadCard toolUse={toolUse} toolResults={toolResults} />;
    case "Edit":
    case "MultiEdit": return <EditCard toolUse={toolUse} toolResults={toolResults} />;
    case "Write":     return <WriteCard toolUse={toolUse} toolResults={toolResults} />;
    case "Grep":      return <GrepCard toolUse={toolUse} toolResults={toolResults} />;
    case "Glob":      return <GlobCard toolUse={toolUse} toolResults={toolResults} />;
    case "WebSearch":
    case "web_search":return <WebSearchCard toolUse={toolUse} toolResults={toolResults} />;
    case "WebFetch":  return <WebFetchCard toolUse={toolUse} toolResults={toolResults} />;
    case "Agent":
    case "Task":      return <AgentCard toolUse={toolUse} toolResults={toolResults} onViewSubagent={onViewSubagent} />;
    default:          return <DefaultCard toolUse={toolUse} toolResults={toolResults} />;
  }
});
