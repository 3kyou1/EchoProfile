/**
 * CommandOutputDisplay Component
 *
 * Displays command output with intelligent formatting based on content type.
 * Supports JSON, test results, build output, package management, tables, and terminal output.
 * Uses design tokens for consistent theming.
 *
 * @example
 * ```tsx
 * <CommandOutputDisplay stdout={commandResult.stdout} />
 * ```
 */

import React from "react";
import { Highlight, themes } from "prism-react-renderer";
import { Terminal, Package, TestTube, Hammer, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getVariantStyles, layout } from "@/components/renderers";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme";
import { getPreStyles, getLineStyles, getTokenStyles } from "@/utils/prismStyles";
import { AnsiText } from "@/components/common/AnsiText";

interface CommandOutputDisplayProps {
  stdout: string;
}

export const CommandOutputDisplay: React.FC<CommandOutputDisplayProps> = ({
  stdout,
}) => {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();

  const isTestOutput =
    stdout.includes("Test Suites:") ||
    stdout.includes("jest") ||
    stdout.includes("coverage");
  const isBuildOutput =
    stdout.includes("webpack") ||
    stdout.includes("build") ||
    stdout.includes("compile");
  const isPackageOutput =
    stdout.includes("npm") ||
    stdout.includes("yarn") ||
    stdout.includes("pnpm");
  const isJsonOutput =
    stdout.trim().startsWith("{") && stdout.trim().endsWith("}");
  const isTableOutput =
    stdout.includes("|") &&
    stdout.includes("-") &&
    stdout.split("\n").length > 2;

  // Get variant styles
  const neutralStyles = getVariantStyles("neutral");
  const successStyles = getVariantStyles("success");
  const terminalStyles = getVariantStyles("terminal");

  if (isJsonOutput) {
    try {
      const parsed = JSON.parse(stdout);
      return (
        <div className="bg-card rounded border border-border">
          <div
            className={cn(
              layout.headerPadding,
              layout.smallText,
              neutralStyles.badge,
              neutralStyles.badgeText
            )}
          >
            {t("commandOutputDisplay.jsonOutput", {
              defaultValue: "JSON Output",
            })}
          </div>
          <Highlight
            theme={isDarkMode ? themes.vsDark : themes.vsLight}
            code={JSON.stringify(parsed, null, 2)}
            language="json"
          >
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre
                className={className}
                style={getPreStyles(isDarkMode, style, {
                  fontSize: "0.6875rem",
                  padding: "0.75rem",
                })}
              >
                {tokens.map((line, i) => {
                  const lineProps = getLineProps({ line, key: i });
                  return (
                    <div key={i} {...lineProps} style={getLineStyles(lineProps.style)}>
                      {line.map((token, key) => {
                        const tokenProps = getTokenProps({ token, key });
                        return (
                          <span
                            key={key}
                            {...tokenProps}
                            style={getTokenStyles(isDarkMode, tokenProps.style)}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </pre>
            )}
          </Highlight>
        </div>
      );
    } catch {
      // Fall through to the non-highlighted renderers below.
    }
  }

  if (isTestOutput) {
    return (
      <div className="bg-card rounded border border-border">
        <div
          className={cn(
            "flex items-center",
            layout.headerPadding,
            layout.iconSpacing,
            layout.smallText,
            successStyles.badge,
            successStyles.badgeText
          )}
        >
          <TestTube className={layout.iconSize} />
          <span>
            {t("commandOutputDisplay.testResults", {
              defaultValue: "Test Results",
            })}
          </span>
        </div>
        <pre className={cn(layout.monoText, "text-foreground/80 whitespace-pre-wrap p-3")}>
          <AnsiText text={stdout} />
        </pre>
      </div>
    );
  }

  if (isBuildOutput) {
    return (
      <div className="bg-card rounded border border-border">
        <div
          className={cn(
            "flex items-center",
            layout.headerPadding,
            layout.iconSpacing,
            layout.smallText,
            terminalStyles.badge,
            terminalStyles.badgeText
          )}
        >
          <Hammer className={layout.iconSize} />
          <span>
            {t("commandOutputDisplay.buildOutput", {
              defaultValue: "Build Output",
            })}
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          <pre className={cn(layout.monoText, "text-foreground/80 whitespace-pre-wrap p-3")}>
            <AnsiText text={stdout} />
          </pre>
        </div>
      </div>
    );
  }

  if (isPackageOutput) {
    return (
      <div className="bg-card rounded border border-border">
        <div
          className={cn(
            "flex items-center",
            layout.headerPadding,
            layout.iconSpacing,
            layout.smallText,
            terminalStyles.badge,
            terminalStyles.badgeText
          )}
        >
          <Package className={layout.iconSize} />
          <span>
            {t("commandOutputDisplay.packageManagement", {
              defaultValue: "Package Management",
            })}
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          <pre className={cn(layout.monoText, "text-foreground/80 whitespace-pre-wrap p-3")}>
            <AnsiText text={stdout} />
          </pre>
        </div>
      </div>
    );
  }

  if (isTableOutput) {
    return (
      <div className="bg-card rounded border border-border">
        <div
          className={cn(
            "flex items-center",
            layout.headerPadding,
            layout.iconSpacing,
            layout.smallText,
            neutralStyles.badge,
            neutralStyles.badgeText
          )}
        >
          <BarChart3 className={layout.iconSize} />
          <span>
            {t("commandOutputDisplay.tableOutput", {
              defaultValue: "Table Output",
            })}
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          <pre className={cn(layout.monoText, "text-foreground/80 whitespace-pre-wrap p-3")}>
            <AnsiText text={stdout} />
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded border border-border">
      <div
        className={cn(
          "flex items-center",
          layout.headerPadding,
          layout.iconSpacing,
          layout.smallText,
          terminalStyles.badge,
          terminalStyles.badgeText
        )}
      >
        <Terminal className={layout.iconSize} />
        <span>
          {t("commandOutputDisplay.terminalOutput", {
            defaultValue: "Terminal Output",
          })}
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto scrollbar-thin">
        <pre className={cn(layout.monoText, "text-foreground/80 whitespace-pre-wrap p-3")}>
          <AnsiText text={stdout} />
        </pre>
      </div>
    </div>
  );
};
