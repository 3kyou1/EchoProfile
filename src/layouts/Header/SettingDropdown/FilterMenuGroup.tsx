import {
  DropdownMenuLabel,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

export const FilterMenuGroup = () => {
  const { t } = useTranslation();
  const { showSystemMessages, setShowSystemMessages } = useAppStore();

  return (
    <>
      <DropdownMenuLabel>
        {t("common.settings.filter.title", { defaultValue: "Filter" })}
      </DropdownMenuLabel>
      <DropdownMenuItem
        role="menuitemcheckbox"
        aria-checked={showSystemMessages}
        onSelect={(e) => {
          e.preventDefault();
          setShowSystemMessages(!showSystemMessages);
        }}
      >
        <Eye className="mr-2 h-4 w-4 text-foreground" />
        <span className="flex-1">
          {t("common.settings.filter.showSystemMessages", {
            defaultValue: "Show system messages",
          })}
        </span>
        <Switch
          checked={showSystemMessages}
          aria-hidden="true"
          tabIndex={-1}
          className="ml-2"
        />
      </DropdownMenuItem>
    </>
  );
};
