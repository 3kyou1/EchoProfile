import type { MCPServerConfig, MCPServerType } from "@/types";

export interface McpServerFormValues {
  type: MCPServerType;
  command: string;
  argsText: string;
  url: string;
  env: Record<string, string>;
}

function splitArgs(argsText: string): string[] | undefined {
  const args = argsText.trim().split(/\s+/).filter(Boolean);
  return args.length > 0 ? args : undefined;
}

function nonEmptyEnv(env: Record<string, string>): Record<string, string> | undefined {
  const entries = Object.entries(env).filter(([key, value]) => key.trim() && value.trim());
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function isValidHttpMcpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildMcpServerConfig(values: McpServerFormValues): MCPServerConfig {
  if (values.type === "http") {
    return {
      type: "http",
      url: values.url.trim(),
    };
  }

  const env = nonEmptyEnv(values.env);
  return {
    type: "stdio",
    command: values.command.trim(),
    args: splitArgs(values.argsText),
    env,
  };
}

export function formatMcpServerDetails(config: MCPServerConfig): string {
  if (config.type === "http") {
    return config.url ?? "";
  }

  return [config.command, ...(config.args ?? [])].filter(Boolean).join(" ");
}
