import { memo, useMemo, useState } from "react";
import { Brain, ChevronRight, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";

type Props = {
  thinking: string;
};

// Escape HTML tags outside of code blocks to prevent ReactMarkdown from stripping them
function escapeHtmlOutsideCode(text: string): string {
  const parts: string[] = [];
  let remaining = text;

  // Handle fenced code blocks first
  const fencedRegex = /(```[\s\S]*?```)/g;
  let lastIndex = 0;
  let match;

  while ((match = fencedRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    parts.push(escapeHtmlPreservingInlineCode(before));
    const codeBlock = match[1] ?? match[0];
    parts.push(codeBlock);
    lastIndex = (match.index ?? 0) + codeBlock.length;
  }

  if (lastIndex < text.length) {
    remaining = text.slice(lastIndex);
  } else {
    return parts.join("");
  }

  const inlineResult = escapeHtmlPreservingInlineCode(remaining);
  parts.push(inlineResult);

  return parts.join("");
}

function escapeHtmlInText(text: string): string {
  return text.replace(/<([a-zA-Z/][^>]*)>/g, "&lt;$1&gt;");
}

function escapeHtmlPreservingInlineCode(text: string): string {
  const parts = text.split(/(`[^`]+`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) {
        return part;
      }
      return escapeHtmlInText(part);
    })
    .join("");
}

// Collapsible thinking block component
function CollapsibleThinking({
  content,
  title,
}: {
  content: string;
  title: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const escapedContent = useMemo(() => {
    if (!content) return "";
    return escapeHtmlOutsideCode(content);
  }, [content]);

  const firstLine = content.split("\n")[0]?.slice(0, 100);
  const hasMore = firstLine && content.length > (firstLine.length || 0);

  return (
    <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors rounded-lg"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        )}
        <Brain className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
          {title}
        </span>
        {!isExpanded && (
          <span className="text-xs text-amber-600 dark:text-amber-400 truncate italic">
            {firstLine}
            {hasMore && "..."}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-0">
          <div className="text-sm text-amber-700 dark:text-amber-300 italic prose prose-sm max-w-none prose-amber dark:prose-invert prose-p:my-1 prose-code:text-amber-800 dark:prose-code:text-amber-200 prose-code:bg-amber-100 dark:prose-code:bg-amber-900/50 prose-pre:bg-amber-100 dark:prose-pre:bg-amber-900/50">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {escapedContent}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

function ThinkingRendererComponent({ thinking }: Props) {
  const { t } = useTranslation("components");

  if (!thinking) return null;

  // Check for legacy <thinking> tags (inline format)
  const thinkingRegex = /<thinking>(.*?)<\/thinking>/gs;
  const matches = thinking.match(thinkingRegex);
  const withoutThinking = thinking.replace(thinkingRegex, "").trim();

  const hasThinkingTags = matches && matches.length > 0;
  const title = t("thinkingRenderer.title");

  // If no <thinking> tags found, treat entire content as thinking block
  if (!hasThinkingTags && thinking.trim()) {
    return <CollapsibleThinking content={thinking} title={title} />;
  }

  // Handle legacy <thinking> tags
  return (
    <div className="space-y-2">
      {matches &&
        matches.map((match, idx) => {
          const thinkingContent = match.replace(/<\/?thinking>/g, "").trim();
          return (
            <CollapsibleThinking
              key={idx}
              content={thinkingContent}
              title={title}
            />
          );
        })}

      {withoutThinking && (
        <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-code:text-red-600 dark:prose-code:text-red-400 prose-code:bg-gray-100 dark:prose-code:bg-gray-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {escapeHtmlOutsideCode(withoutThinking)}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export const ThinkingRenderer = memo(ThinkingRendererComponent);
