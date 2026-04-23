import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FigurePoolManager } from "@/components/CopaProfile/FigurePoolManager";
import type { FigurePool } from "@/types/figurePool";

const mockUseTranslation = vi.fn();
let activeLanguage = "en";

vi.mock("react-i18next", () => ({
  useTranslation: () => mockUseTranslation(),
}));

function buildPools(): FigurePool[] {
  return [
    {
      id: "builtin-scientists",
      name: "Scientists",
      origin: "builtin",
      isDefault: true,
      createdAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
      schemaVersion: 1,
      validationSummary: {
        validCount: 1,
        invalidCount: 1,
        errorCount: 1,
      },
      records: [
        {
          slug: "ada_lovelace",
          name: "Ada Lovelace",
          localized_names: { zh: "艾达·洛夫莱斯" },
          portrait_url: "/ada.jpg",
          quote_en: "quote",
          quote_zh: "quote",
          core_traits: "traits",
          thinking_style: "style",
          temperament_tags: "tags",
          temperament_summary: "summary",
          loading_copy_zh: "loading",
          loading_copy_en: "loading",
          bio_zh: "中文人物介绍。后面这句是详细生平，不应该显示。",
          bio_en: "English biography. This second sentence should stay hidden.",
          achievements_zh: ["one"],
          achievements_en: ["one"],
          status: "valid",
          errors: [],
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
        {
          slug: "broken_record",
          name: "Broken Record",
          localized_names: { zh: "坏记录" },
          portrait_url: "",
          quote_en: "quote",
          quote_zh: "quote",
          core_traits: "traits",
          thinking_style: "style",
          temperament_tags: "tags",
          temperament_summary: "summary",
          loading_copy_zh: "loading",
          loading_copy_en: "loading",
          bio_zh: "无效人物介绍。后面这句是详细生平，不应该显示。",
          bio_en: "Invalid biography. This second sentence should stay hidden.",
          achievements_zh: ["one"],
          achievements_en: ["one"],
          status: "invalid",
          errors: [{ field: "portrait_url", message: "portrait_url is required" }],
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
      ],
    },
  ];
}

describe("FigurePoolManager", () => {
  beforeEach(() => {
    activeLanguage = "en";
    mockUseTranslation.mockReturnValue({
      t: (_key: string, fallback?: string, values?: Record<string, string | number>) => {
        if (fallback?.includes("{{valid}}") && values) {
          return `${values.valid} usable / ${values.invalid} invalid`;
        }
        if (fallback?.includes("{{count}}") && values) {
          return `${values.count} invalid records are excluded from matching.`;
        }
        return fallback ?? _key;
      },
      i18n: {
        language: activeLanguage,
        resolvedLanguage: activeLanguage,
      },
    });
  });

  it("shows pool availability summaries and fires the import action", () => {
    const onImport = vi.fn();

    render(
      <FigurePoolManager
        pools={buildPools()}
        selectedPoolId="builtin-scientists"
        importSummaryPool={null}
        onSelectPool={vi.fn()}
        onImport={onImport}
        onExport={vi.fn()}
        onRenamePool={vi.fn()}
        onSetDefault={vi.fn()}
        onDeletePool={vi.fn()}
        onCreateRecord={vi.fn()}
        onUpdateRecord={vi.fn()}
        onDeleteRecord={vi.fn()}
      />
    );

    expect(screen.getByText("1 usable / 1 invalid")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(onImport).toHaveBeenCalled();
  });

  it("filters the record list down to invalid entries when requested", () => {
    render(
      <FigurePoolManager
        pools={buildPools()}
        selectedPoolId="builtin-scientists"
        importSummaryPool={null}
        onSelectPool={vi.fn()}
        onImport={vi.fn()}
        onExport={vi.fn()}
        onRenamePool={vi.fn()}
        onSetDefault={vi.fn()}
        onDeletePool={vi.fn()}
        onCreateRecord={vi.fn()}
        onUpdateRecord={vi.fn()}
        onDeleteRecord={vi.fn()}
      />
    );

    expect(screen.getByText("1 invalid records are excluded from matching.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show invalid only" }));

    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Broken Record")).toBeInTheDocument();
  });

  it("shows localized names and only the lead biography sentence for the active language", () => {
    activeLanguage = "zh-CN";
    mockUseTranslation.mockReturnValue({
      t: (_key: string, fallback?: string, values?: Record<string, string | number>) => {
        if (fallback?.includes("{{valid}}") && values) {
          return `${values.valid} 可用 / ${values.invalid} 无效`;
        }
        if (fallback?.includes("{{count}}") && values) {
          return `有 ${values.count} 个无效人物已被排除在匹配之外。`;
        }
        return fallback ?? _key;
      },
      i18n: {
        language: activeLanguage,
        resolvedLanguage: activeLanguage,
      },
    });

    render(
      <FigurePoolManager
        pools={buildPools()}
        selectedPoolId="builtin-scientists"
        importSummaryPool={null}
        onSelectPool={vi.fn()}
        onImport={vi.fn()}
        onExport={vi.fn()}
        onRenamePool={vi.fn()}
        onSetDefault={vi.fn()}
        onDeletePool={vi.fn()}
        onCreateRecord={vi.fn()}
        onUpdateRecord={vi.fn()}
        onDeleteRecord={vi.fn()}
      />
    );

    expect(screen.getByText("艾达·洛夫莱斯")).toBeInTheDocument();
    expect(screen.getByText("中文人物介绍。")).toBeInTheDocument();
    expect(screen.queryByText("后面这句是详细生平，不应该显示。")).not.toBeInTheDocument();
  });

  it("shows English names and only the lead biography sentence in the English interface", () => {
    render(
      <FigurePoolManager
        pools={buildPools()}
        selectedPoolId="builtin-scientists"
        importSummaryPool={null}
        onSelectPool={vi.fn()}
        onImport={vi.fn()}
        onExport={vi.fn()}
        onRenamePool={vi.fn()}
        onSetDefault={vi.fn()}
        onDeletePool={vi.fn()}
        onCreateRecord={vi.fn()}
        onUpdateRecord={vi.fn()}
        onDeleteRecord={vi.fn()}
      />
    );

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("English biography.")).toBeInTheDocument();
    expect(screen.queryByText("This second sentence should stay hidden.")).not.toBeInTheDocument();
  });

  it("keeps the per-record action buttons top-aligned in a dedicated right column", () => {
    render(
      <FigurePoolManager
        pools={buildPools()}
        selectedPoolId="builtin-scientists"
        importSummaryPool={null}
        onSelectPool={vi.fn()}
        onImport={vi.fn()}
        onExport={vi.fn()}
        onRenamePool={vi.fn()}
        onSetDefault={vi.fn()}
        onDeletePool={vi.fn()}
        onCreateRecord={vi.fn()}
        onUpdateRecord={vi.fn()}
        onDeleteRecord={vi.fn()}
      />
    );

    expect(screen.getByTestId("figure-record-card-ada_lovelace")).toHaveClass("md:grid", "md:grid-cols-[minmax(0,1fr)_auto]");
    expect(screen.getByTestId("figure-record-actions-ada_lovelace")).toHaveClass("md:self-start", "md:justify-end");
  });

  it("opens the editor drawer and submits a new record", async () => {
    const onCreateRecord = vi.fn().mockResolvedValue(undefined);

    render(
      <FigurePoolManager
        pools={buildPools()}
        selectedPoolId="builtin-scientists"
        importSummaryPool={null}
        onSelectPool={vi.fn()}
        onImport={vi.fn()}
        onExport={vi.fn()}
        onRenamePool={vi.fn()}
        onSetDefault={vi.fn()}
        onDeletePool={vi.fn()}
        onCreateRecord={onCreateRecord}
        onUpdateRecord={vi.fn()}
        onDeleteRecord={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add record" }));
    fireEvent.change(screen.getByPlaceholderText("slug"), { target: { value: "new_record" } });
    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "New Record" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onCreateRecord).toHaveBeenCalledWith(
        "builtin-scientists",
        expect.objectContaining({
          slug: "new_record",
          name: "New Record",
        })
      );
    });
  });
});
