import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { FigureResonanceCard } from "@/components/CopaProfile/FigureResonanceCard";
import type { FigureResonanceCard as FigureResonanceCardType } from "@/types/figureResonance";

const mockUseTranslation = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => mockUseTranslation(),
}));

describe("figure locale cleanup", () => {
  it("falls back to English wikipedia when the app language is unsupported", () => {
    mockUseTranslation.mockReturnValue({
      t: (_key: string, fallback?: string) => fallback ?? "Wikipedia",
      i18n: {
        resolvedLanguage: "ja-JP",
        language: "ja-JP",
      },
    });

    const card: FigureResonanceCardType = {
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

    render(<FigureResonanceCard card={card} label="Primary" compact />);

    expect(screen.getByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wikipedia" })).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Ada_Lovelace"
    );
  });

  it("renders resonance portraits in full color", () => {
    mockUseTranslation.mockReturnValue({
      t: (_key: string, fallback?: string) => fallback ?? "Wikipedia",
      i18n: {
        resolvedLanguage: "en",
        language: "en",
      },
    });

    const card: FigureResonanceCardType = {
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

    render(<FigureResonanceCard card={card} label="Primary" compact />);

    expect(screen.getByRole("img", { name: "Ada Lovelace" })).not.toHaveClass("grayscale");
  });
});
