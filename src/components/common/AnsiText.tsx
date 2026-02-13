import { useMemo } from "react";
import { ansiToHtml } from "@/utils/ansiToHtml";

interface AnsiTextProps {
  text: string;
  className?: string;
}

/**
 * Renders text with ANSI codes as styled HTML.
 * Falls back to plain text if no ANSI codes detected.
 * 
 * Note: ansiToHtml() already checks for ANSI codes internally and returns
 * the original text if none are present, so it's safe to always use
 * dangerouslySetInnerHTML (the library escapes HTML when escapeXML: true).
 */
export const AnsiText = ({ text, className }: AnsiTextProps) => {
  const html = useMemo(() => ansiToHtml(text), [text]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
