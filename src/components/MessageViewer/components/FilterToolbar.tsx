import { Filter, RotateCcw, User, Bot, MessageSquareText, Brain, Wrench, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAppStore } from "../../../store/useAppStore";

interface FilterToggleProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}

function FilterToggle({ active, onClick, label, icon }: FilterToggleProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
        active
          ? "bg-accent/15 text-accent border border-accent/30"
          : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300 hover:border-zinc-600"
      )}
      aria-pressed={active}
      aria-label={label}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

interface FilterToolbarProps {
  totalCount: number;
  filteredCount: number;
}

export function FilterToolbar({ totalCount, filteredCount }: FilterToolbarProps) {
  const { t } = useTranslation();
  const {
    messageFilter,
    toggleRole,
    toggleContentType,
    resetMessageFilter,
    isMessageFilterActive,
  } = useAppStore();

  const isActive = isMessageFilterActive();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 px-3 py-1.5 border-b border-border/30 shrink-0",
        isActive && "bg-accent/5"
      )}
    >
      {/* Filter icon + count */}
      <div className="flex items-center gap-1.5">
        <Filter className={cn("w-3.5 h-3.5", isActive ? "text-accent" : "text-muted-foreground")} />
        {isActive ? (
          <span className="text-2xs text-accent font-medium tabular-nums">
            {t("filter.showing", { filtered: filteredCount, total: totalCount })}
          </span>
        ) : (
          <span className="text-2xs text-muted-foreground tabular-nums">{totalCount}</span>
        )}
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-border/50" />

      {/* Role filters */}
      <div className="flex items-center gap-1">
        <span className="text-2xs text-muted-foreground mr-0.5">{t("filter.roles")}:</span>
        <FilterToggle
          active={messageFilter.roles.user}
          onClick={() => toggleRole("user")}
          label={t("filter.role.user")}
          icon={<User className="w-3 h-3" />}
        />
        <FilterToggle
          active={messageFilter.roles.assistant}
          onClick={() => toggleRole("assistant")}
          label={t("filter.role.assistant")}
          icon={<Bot className="w-3 h-3" />}
        />
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-border/50" />

      {/* Content type filters */}
      <div className="flex items-center gap-1">
        <span className="text-2xs text-muted-foreground mr-0.5">{t("filter.contentTypes")}:</span>
        <FilterToggle
          active={messageFilter.contentTypes.text}
          onClick={() => toggleContentType("text")}
          label={t("filter.content.text")}
          icon={<MessageSquareText className="w-3 h-3" />}
        />
        <FilterToggle
          active={messageFilter.contentTypes.thinking}
          onClick={() => toggleContentType("thinking")}
          label={t("filter.content.thinking")}
          icon={<Brain className="w-3 h-3" />}
        />
        <FilterToggle
          active={messageFilter.contentTypes.toolCalls}
          onClick={() => toggleContentType("toolCalls")}
          label={t("filter.content.toolCalls")}
          icon={<Wrench className="w-3 h-3" />}
        />
        <FilterToggle
          active={messageFilter.contentTypes.commands}
          onClick={() => toggleContentType("commands")}
          label={t("filter.content.commands")}
          icon={<Terminal className="w-3 h-3" />}
        />
      </div>

      {/* Reset button */}
      {isActive && (
        <>
          <div className="h-4 w-px bg-border/50" />
          <button
            onClick={resetMessageFilter}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
            aria-label={t("filter.reset")}
            title={t("filter.reset")}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
