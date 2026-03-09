import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { supportedLanguages, type SupportedLanguage } from "@/i18n";
import { useLanguageStore } from "@/store/useLanguageStore";
import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";

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
            onClick={() => {
              if (code in supportedLanguages) {
                setLanguage(code as SupportedLanguage);
              }
            }}
          >
            <span className="flex-1">{name}</span>
            {language === code && (
              <Check className="ml-auto h-4 w-4 text-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
