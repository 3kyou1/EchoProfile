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

  it("uses English-specific figure copy in the English UI", () => {
    mockUseTranslation.mockReturnValue({
      t: (_key: string, fallback?: string) => fallback ?? "Wikipedia",
      i18n: {
        resolvedLanguage: "en",
        language: "en",
      },
    });

    const card: FigureResonanceCardType = {
      name: "Architect (INTJ)",
      localized_names: { zh: "建筑师（INTJ）" },
      slug: "intj_architect",
      portrait_url: "/intj.png",
      hook: "像一个总在默默画总蓝图的人。",
      quote_zh: "如果系统总在失灵，那就重构系统。",
      quote_en: "If the system keeps failing, redesign the system.",
      reason: "你长期更像 Architect (INTJ)：先从全局框架入手。",
      resonance_axes: ["战略视野"],
      confidence_style: "strong_resonance",
      loading_copy_zh: "正在调亮建筑师频率...",
      loading_copy_en: "Brightening the Architect signal...",
      bio_zh: "建筑师原型代表高自主、强结构和长线策略感。",
      bio_en: "The Architect archetype represents autonomy, structure, and long-range strategy.",
      achievements_zh: ["把模糊目标整理成路线图"],
      achievements_en: ["Turns vague ambitions into clean roadmaps"],
    };

    render(<FigureResonanceCard card={card} label="Primary" />);

    expect(screen.getByText("The Architect archetype represents autonomy, structure, and long-range strategy.")).toBeInTheDocument();
    expect(screen.getByText("Turns vague ambitions into clean roadmaps")).toBeInTheDocument();
    expect(screen.getByText("If the system keeps failing, redesign the system.")).toBeInTheDocument();
    expect(screen.queryByText("建筑师原型代表高自主、强结构和长线策略感。")).not.toBeInTheDocument();
    expect(screen.queryByText("把模糊目标整理成路线图")).not.toBeInTheDocument();
  });
});
