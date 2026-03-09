import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { supportedLanguages, type SupportedLanguage } from "@/i18n";
import { useLanguageStore } from "@/store/useLanguageStore";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

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
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => {
            if (value in supportedLanguages) {
              setLanguage(value as SupportedLanguage);
            }
          }}
        >
          {Object.entries(supportedLanguages).map(([code, name]) => (
            <DropdownMenuRadioItem key={code} value={code}>
              {name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
