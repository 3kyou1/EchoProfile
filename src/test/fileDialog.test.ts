import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/platform", () => ({
  isTauri: () => false,
}));

import { openBinaryFileDialog, openFileDialog } from "@/utils/fileDialog";

class MockFileReader {
  static nextResult: string | ArrayBuffer | null = null;
  static shouldError = false;

  result: string | ArrayBuffer | null = null;
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;

  readAsArrayBuffer(file: Blob) {
    void file;
    if (MockFileReader.shouldError) {
      this.onerror?.();
      return;
    }
    this.result = MockFileReader.nextResult;
    this.onload?.();
  }

  readAsText(file: Blob) {
    void file;
    if (MockFileReader.shouldError) {
      this.onerror?.();
      return;
    }
    this.result = MockFileReader.nextResult;
    this.onload?.();
  }
}

describe("fileDialog web fallbacks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("FileReader", MockFileReader);
    MockFileReader.nextResult = null;
    MockFileReader.shouldError = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("attaches binary picker input to the DOM and removes it after a successful selection", async () => {
    MockFileReader.nextResult = Uint8Array.from([1, 2, 3]).buffer;

    const promise = openBinaryFileDialog({ filters: [{ name: "ZIP", extensions: ["zip"] }] });
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(input).not.toBeNull();
    expect(input?.accept).toBe(".zip");

    Object.defineProperty(input!, "files", {
      configurable: true,
      value: { 0: new File([new Uint8Array([1, 2, 3])], "scientists.zip"), length: 1 },
    });

    input!.onchange?.(new Event("change") as never);

    await expect(promise).resolves.toEqual({
      data: new Uint8Array([1, 2, 3]),
      name: "scientists.zip",
      size: 3,
    });
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
  });

  it("resolves null and removes the text picker input when the chooser is cancelled", async () => {
    const promise = openFileDialog({ filters: [{ name: "JSON", extensions: ["json"] }] });
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(input).not.toBeNull();
    expect(input?.accept).toBe(".json");

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toBeNull();
    expect(document.body.querySelector('input[type="file"]')).toBeNull();
  });

  it("does not treat a successful binary selection as cancel when window focus returns before change", async () => {
    MockFileReader.nextResult = Uint8Array.from([9, 8, 7]).buffer;

    const promise = openBinaryFileDialog({ filters: [{ name: "ZIP", extensions: ["zip"] }] });
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(input).not.toBeNull();

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(300);

    Object.defineProperty(input!, "files", {
      configurable: true,
      value: { 0: new File([new Uint8Array([9, 8, 7])], "scientists.zip"), length: 1 },
    });

    input!.onchange?.(new Event("change") as never);
    await vi.advanceTimersByTimeAsync(300);

    await expect(promise).resolves.toEqual({
      data: new Uint8Array([9, 8, 7]),
      name: "scientists.zip",
      size: 3,
    });
  });
});
