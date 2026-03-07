import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthToken,
  getAuthToken,
  initAuthToken,
  openExternalUrl,
  recoverAuthFromErrorQuery,
  setAuthToken,
} from "./platform";

describe("platform auth token helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("stores and reads token with trimming", () => {
    setAuthToken("  abc-token  ");
    expect(getAuthToken()).toBe("abc-token");
  });

  it("clears token for empty values", () => {
    setAuthToken("abc");
    setAuthToken("   ");
    expect(getAuthToken()).toBeNull();
  });

  it("clearAuthToken removes stored token", () => {
    setAuthToken("abc");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it("initAuthToken stores token from URL and removes query token", () => {
    window.history.replaceState({}, "", "/?token=xyz");
    initAuthToken();

    expect(getAuthToken()).toBe("xyz");
    expect(new URL(window.location.href).searchParams.get("token")).toBeNull();
  });

  it("recoverAuthFromErrorQuery does nothing when auth_error is absent", () => {
    window.history.replaceState({}, "", "/?foo=bar");
    expect(recoverAuthFromErrorQuery()).toBe(false);
  });

  it("recoverAuthFromErrorQuery clears auth_error when token already exists", () => {
    setAuthToken("abc");
    window.history.replaceState({}, "", "/?auth_error=1");

    expect(recoverAuthFromErrorQuery()).toBe(false);
    expect(new URL(window.location.href).searchParams.get("auth_error")).toBeNull();
  });

  it("recoverAuthFromErrorQuery keeps page when prompt is cancelled", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
    window.history.replaceState({}, "", "/?auth_error=1");

    expect(recoverAuthFromErrorQuery()).toBe(false);
    expect(promptSpy).toHaveBeenCalled();
    expect(getAuthToken()).toBeNull();
    expect(new URL(window.location.href).searchParams.get("auth_error")).toBe("1");
  });
});

describe("openExternalUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("rejects unsupported URL schemes", async () => {
    await expect(openExternalUrl("javascript:alert(1)")).rejects.toThrow("Unsupported URL scheme");
  });

  it("rejects when popup is blocked in web mode", async () => {
    vi.spyOn(window, "open").mockReturnValueOnce(null);
    await expect(openExternalUrl("https://example.com")).rejects.toThrow("Popup blocked or failed to open");
  });
});
