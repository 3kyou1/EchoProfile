import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import scientistPool from "@/data/scientistPool.json";
import { ScientistResonanceCard } from "@/components/CopaProfile/ScientistResonanceCard";
import type { ScientistResonanceCard as ScientistResonanceCardType } from "@/types/scientistResonance";

const mockUseTranslation = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => mockUseTranslation(),
}));

describe("scientist locale cleanup", () => {
  it("keeps only zh localized scientist names in the bundled pool", () => {
    for (const scientist of scientistPool) {
      expect(Object.keys(scientist.localized_names ?? {})).toEqual(
        Object.keys(scientist.localized_names ?? {}).filter((key) => key === "zh")
      );
      expect(scientist.localized_names ?? {}).not.toHaveProperty("ja");
      expect(scientist.localized_names ?? {}).not.toHaveProperty("ko");
    }
  });

  it("falls back to English wikipedia when the app language is unsupported", () => {
    mockUseTranslation.mockReturnValue({
      t: (_key: string, fallback?: string) => fallback ?? "Wikipedia",
      i18n: {
        resolvedLanguage: "ja-JP",
        language: "ja-JP",
      },
    });

    const card: ScientistResonanceCardType = {
      name: "Ada Lovelace",
      localized_names: { zh: "艾达·洛夫莱斯" },
      slug: "ada_lovelace",
      portrait_url: "/ada.jpg",
      hook: "hook",
      quote_zh: "quote zh",
      quote_en: "quote en",
      reason: "reason",
      resonance_axes: ["Systems"],
      confidence_style: "strong_resonance",
      loading_copy_zh: "loading zh",
      loading_copy_en: "loading en",
      bio_zh: "bio zh",
      bio_en: "bio en",
      achievements_zh: ["ach zh"],
      achievements_en: ["ach en"],
    };

    render(<ScientistResonanceCard card={card} label="Primary" compact />);

    expect(screen.getByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wikipedia" })).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Ada_Lovelace"
    );
  });
});
