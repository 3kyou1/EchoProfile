import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "react-i18next";
import { Type } from "lucide-react";
import { cn } from "@/lib/utils";

const FONT_SCALE_OPTIONS = [
  { value: 90, labelKey: "common.settings.font.90" as const },
  { value: 100, labelKey: "common.settings.font.100" as const },
  { value: 110, labelKey: "common.settings.font.110" as const },
  { value: 120, labelKey: "common.settings.font.120" as const },
  { value: 130, labelKey: "common.settings.font.130" as const },
];

export const FontMenuGroup = () => {
  const { t } = useTranslation();
  const { fontScale, setFontScale } = useAppStore();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Type className="mr-2 h-4 w-4 text-foreground" />
        <span>
          {t("common.settings.font.title")} · {fontScale}%
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {FONT_SCALE_OPTIONS.map(({ value, labelKey }) => (
          <DropdownMenuItem
            key={value}
            className={cn(
              fontScale === value && "bg-accent text-accent-foreground"
            )}
            onClick={() => {
              if (Number.isFinite(value)) {
                void setFontScale(value);
              }
            }}
          >
            <span>
              {t(labelKey)} ({value}%)
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
