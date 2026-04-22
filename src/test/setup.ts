import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs for testing environment
interface TauriMock {
  tauri: {
    invoke: ReturnType<typeof vi.fn>;
  };
  event: {
    listen: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
  };
}

global.window = global.window || {};
(global.window as typeof global.window & { __TAURI__: TauriMock }).__TAURI__ = {
  tauri: {
    invoke: vi.fn(),
  },
  event: {
    listen: vi.fn(),
    emit: vi.fn(),
  },
};

const createStorageMock = (): Storage => {
  const backing = new Map<string, string>();

  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, String(value));
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => {
      backing.clear();
    },
    key: (index: number) => Array.from(backing.keys())[index] ?? null,
    get length() {
      return backing.size;
    },
  };
};

if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof globalThis.localStorage.clear !== 'function'
) {
  const storage = createStorageMock();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  });

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  });
}

// Mock matchMedia for components that use media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver for virtual scrolling components
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {}
} as unknown as {
  new (): IntersectionObserver;
  prototype: IntersectionObserver;
};

// Mock ResizeObserver for components that observe size changes
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as unknown as {
  new (): ResizeObserver;
  prototype: ResizeObserver;
};
