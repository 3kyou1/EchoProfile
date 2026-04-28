import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockApi, mockIsTauri } = vi.hoisted(() => ({
  mockApi: vi.fn(),
  mockIsTauri: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  api: mockApi,
}));

vi.mock("@/utils/platform", () => ({
  isTauri: mockIsTauri,
}));

import { saveLlmConfig } from "@/services/llmProxyService";

describe("llmProxyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockResolvedValue({
      copa: { baseUrl: "", model: "", temperature: 0.2, hasApiKey: false },
      resonance: { baseUrl: "", model: "", temperature: 0.3, hasApiKey: false },
    });
  });

  test("wraps save_llm_config input for Tauri invoke", async () => {
    mockIsTauri.mockReturnValue(true);
    const input = {
      purpose: "copa" as const,
      baseUrl: "https://example.com/v1",
      model: "test-model",
      temperature: 0.2,
      apiKey: "sk-test",
    };

    await saveLlmConfig(input);

    expect(mockApi).toHaveBeenCalledWith("save_llm_config", { input });
  });

  test("keeps save_llm_config flat for WebUI endpoint", async () => {
    mockIsTauri.mockReturnValue(false);
    const input = {
      purpose: "copa" as const,
      baseUrl: "https://example.com/v1",
      model: "test-model",
      temperature: 0.2,
      apiKey: "sk-test",
    };

    await saveLlmConfig(input);

    expect(mockApi).toHaveBeenCalledWith("save_llm_config", input);
  });
});
