import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { FigureRecordInput, FigurePoolRecord } from "@/types/figurePool";

interface FigurePoolEditorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialRecord: FigureRecordInput;
  onSave: (record: FigureRecordInput) => Promise<void> | void;
  saving?: boolean;
  errors?: FigurePoolRecord["errors"];
}

function achievementsToText(values: string[]): string {
  return values.join("\n");
}

function textToAchievements(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function FigurePoolEditorDrawer({
  open,
  onOpenChange,
  title,
  initialRecord,
  onSave,
  saving = false,
  errors = [],
}: FigurePoolEditorDrawerProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<FigureRecordInput>(initialRecord);

  useEffect(() => {
    if (open) {
      setDraft(initialRecord);
    }
  }, [initialRecord, open]);

  const handleSave = async () => {
    await onSave({
      ...draft,
      achievements_zh: textToAchievements(achievementsToText(draft.achievements_zh)),
      achievements_en: textToAchievements(achievementsToText(draft.achievements_en)),
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 p-4 pt-0">
          {errors.length > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900">
              {errors.map((error) => (
                <p key={`${error.field}-${error.message}`}>{error.message}</p>
              ))}
            </div>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t("common.copa.resonance.pool.editor.basic", "Basic info")}</h3>
            <Input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} placeholder="slug" />
            <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={t("common.name", "Name")} />
            <Input
              value={draft.localized_names?.zh ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  localized_names: { ...(draft.localized_names ?? {}), zh: event.target.value },
                })
              }
              placeholder={t("common.copa.resonance.pool.editor.localizedZh", "Chinese name")}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t("common.copa.resonance.pool.editor.media", "Media")}</h3>
            <Input
              value={draft.portrait_url}
              onChange={(event) => setDraft({ ...draft, portrait_url: event.target.value })}
              placeholder="portrait_url"
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t("common.copa.resonance.pool.editor.matching", "Matching fields")}</h3>
            <Textarea value={draft.core_traits} onChange={(event) => setDraft({ ...draft, core_traits: event.target.value })} placeholder="core_traits" />
            <Textarea value={draft.thinking_style} onChange={(event) => setDraft({ ...draft, thinking_style: event.target.value })} placeholder="thinking_style" />
            <Textarea value={draft.temperament_tags} onChange={(event) => setDraft({ ...draft, temperament_tags: event.target.value })} placeholder="temperament_tags" />
            <Textarea value={draft.temperament_summary} onChange={(event) => setDraft({ ...draft, temperament_summary: event.target.value })} placeholder="temperament_summary" />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t("common.copa.resonance.pool.editor.copy", "Display copy")}</h3>
            <Textarea value={draft.quote_zh} onChange={(event) => setDraft({ ...draft, quote_zh: event.target.value })} placeholder="quote_zh" />
            <Textarea value={draft.quote_en} onChange={(event) => setDraft({ ...draft, quote_en: event.target.value })} placeholder="quote_en" />
            <Textarea value={draft.loading_copy_zh} onChange={(event) => setDraft({ ...draft, loading_copy_zh: event.target.value })} placeholder="loading_copy_zh" />
            <Textarea value={draft.loading_copy_en} onChange={(event) => setDraft({ ...draft, loading_copy_en: event.target.value })} placeholder="loading_copy_en" />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t("common.copa.resonance.pool.editor.content", "Content")}</h3>
            <Textarea value={draft.bio_zh} onChange={(event) => setDraft({ ...draft, bio_zh: event.target.value })} placeholder="bio_zh" />
            <Textarea value={draft.bio_en} onChange={(event) => setDraft({ ...draft, bio_en: event.target.value })} placeholder="bio_en" />
            <Textarea
              value={achievementsToText(draft.achievements_zh)}
              onChange={(event) => setDraft({ ...draft, achievements_zh: textToAchievements(event.target.value) })}
              placeholder="achievements_zh"
            />
            <Textarea
              value={achievementsToText(draft.achievements_en)}
              onChange={(event) => setDraft({ ...draft, achievements_en: textToAchievements(event.target.value) })}
              placeholder="achievements_en"
            />
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {t("common.save", "Save")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
