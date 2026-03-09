import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { supportedLanguages, type SupportedLanguage } from "@/i18n";
import { useLanguageStore } from "@/store/useLanguageStore";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export const LanguageMenuGroup = () => {
  const { language, setLanguage } = useLanguageStore();
  const { t } = useTranslation();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Globe className="mr-2 h-4 w-4 text-foreground" />
        <span>
          {t("common.settings.language.title")} · {supportedLanguages[language]}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {Object.entries(supportedLanguages).map(([code, name]) => (
          <DropdownMenuItem
            key={code}
            className={cn(
              language === code && "bg-accent text-accent-foreground"
            )}
            onClick={() => {
              if (code in supportedLanguages) {
                setLanguage(code as SupportedLanguage);
              }
            }}
          >
            <span>{name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
