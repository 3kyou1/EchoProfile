import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockApi, mockCreateModuleLogger, mockIsTauri } = vi.hoisted(() => {
  const moduleLogger = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    mockApi: vi.fn().mockResolvedValue(undefined),
    mockCreateModuleLogger: vi.fn(() => moduleLogger),
    mockIsTauri: vi.fn(() => false),
  };
});

vi.mock("@/services/api", () => ({
  api: mockApi,
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: mockCreateModuleLogger,
}));

vi.mock("@/utils/platform", () => ({
  isTauri: mockIsTauri,
}));

describe("llmDebugLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(false);
  });

  it("sends webui logs to the backend endpoint in browser mode", async () => {
    vi.stubGlobal("window", {
      location: {
        origin: "http://127.0.0.1:3727",
      },
    });

    const { persistLlmDebugLog } = await import("@/services/llmDebugLogger");

    await persistLlmDebugLog({
      category: "copa",
      stage: "diagnosis",
      payload: {
        rawContent: "x".repeat(9000),
      },
    });

    expect(mockApi).toHaveBeenCalledWith("log_frontend_llm_debug", {
      category: "copa",
      stage: "diagnosis",
      level: "debug",
      payload: expect.stringContaining("[truncated 1000 chars]"),
    });
  });
});
