import { api } from "@/services/api";

export type LlmPurpose = "copa" | "resonance";

export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmProxyRequest {
  purpose: LlmPurpose;
  baseUrl: string;
  model: string;
  temperature?: number;
  responseFormat: unknown;
  messages: LlmChatMessage[];
}

export interface LlmProxyResponse {
  status: number;
  statusText: string;
  body?: unknown;
  text?: string;
}

export interface LlmRuntimeModelConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  hasApiKey: boolean;
}

export interface LlmRuntimeConfig {
  copa: LlmRuntimeModelConfig;
  resonance: LlmRuntimeModelConfig;
}

export interface SaveLlmApiKeyInput {
  purpose: LlmPurpose;
  apiKey: string;
}

export async function getLlmRuntimeConfig(): Promise<LlmRuntimeConfig> {
  return api<LlmRuntimeConfig>("get_llm_runtime_config");
}

export async function saveLlmApiKey(input: SaveLlmApiKeyInput): Promise<LlmRuntimeConfig> {
  return api<LlmRuntimeConfig>("save_llm_api_key", input as unknown as Record<string, unknown>);
}

export async function deleteLlmApiKey(purpose: LlmPurpose): Promise<LlmRuntimeConfig> {
  return api<LlmRuntimeConfig>("delete_llm_api_key", { purpose });
}

export async function requestLlmChatCompletion(input: LlmProxyRequest): Promise<LlmProxyResponse> {
  return api<LlmProxyResponse>("request_llm_chat_completion", input as unknown as Record<string, unknown>);
}

export function getLlmProxyResponseText(response: LlmProxyResponse): string {
  if (typeof response.text === "string" && response.text.length > 0) {
    return response.text;
  }
  if (typeof response.body === "string") {
    return response.body;
  }
  if (response.body != null) {
    try {
      return JSON.stringify(response.body);
    } catch {
      return "";
    }
  }
  return "";
}
