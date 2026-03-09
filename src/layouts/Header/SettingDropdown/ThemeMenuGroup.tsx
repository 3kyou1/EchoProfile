import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { Sun, Moon, Laptop, Check } from "lucide-react";
import { useTheme } from "@/contexts/theme";

const THEME_ITEMS = [
  { icon: Sun, labelKey: "common.settings.theme.light", value: "light" },
  { icon: Moon, labelKey: "common.settings.theme.dark", value: "dark" },
  { icon: Laptop, labelKey: "common.settings.theme.system", value: "system" },
] as const;

export const ThemeMenuGroup = () => {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const currentThemeItem = THEME_ITEMS.find((item) => item.value === theme);
  const CurrentIcon = currentThemeItem?.icon ?? Sun;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <CurrentIcon className="mr-2 h-4 w-4 text-foreground" />
        <span>
          {t("common.settings.theme.title")} ·{" "}
          {currentThemeItem ? t(currentThemeItem.labelKey) : theme}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {THEME_ITEMS.map(({ icon: Icon, labelKey, value }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => {
              if (value === "light" || value === "dark" || value === "system") {
                void setTheme(value);
              }
            }}
          >
            <Icon className="mr-2 h-4 w-4 text-foreground" />
            <span className="flex-1">{t(labelKey)}</span>
            {theme === value && (
              <Check className="ml-auto h-4 w-4 text-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
