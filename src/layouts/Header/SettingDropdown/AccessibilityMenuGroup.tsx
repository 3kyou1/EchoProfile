import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "react-i18next";
import { Contrast } from "lucide-react";

export const AccessibilityMenuGroup = () => {
  const { t } = useTranslation();
  const { highContrast, setHighContrast } = useAppStore();

  return (
    <>
      <DropdownMenuLabel>
        {t("common.settings.accessibility.title")}
      </DropdownMenuLabel>
      <DropdownMenuItem
        onSelect={(e) => e.preventDefault()}
        onClick={() => void setHighContrast(!highContrast)}
      >
        <Contrast className="mr-2 h-4 w-4 text-foreground" />
        <span className="flex-1">
          {t("common.settings.accessibility.highContrast")}
        </span>
        <Switch
          checked={highContrast}
          onCheckedChange={(checked) => void setHighContrast(checked)}
          aria-label={t("common.settings.accessibility.highContrast")}
          className="ml-2"
          onClick={(e) => e.stopPropagation()}
        />
      </DropdownMenuItem>
    </>
  );
};
