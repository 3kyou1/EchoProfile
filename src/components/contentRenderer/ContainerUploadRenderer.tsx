import { memo } from "react";
import { Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { layout } from "@/components/renderers";
import { cn } from "@/lib/utils";
import { ToolResultCard } from "./ToolResultCard";

type Props = {
  fileId: string;
};

export const ContainerUploadRenderer = memo(function ContainerUploadRenderer({
  fileId,
}: Props) {
  const { t } = useTranslation();

  return (
    <ToolResultCard
      title={t("renderers.containerUpload.title", "Container File Upload")}
      icon={<Upload className={cn(layout.iconSize, "text-muted-foreground")} />}
      variant="neutral"
    >
      <div className={cn(layout.bodyText, "text-muted-foreground")}>
        {t(
          "renderers.containerUpload.description",
          "File uploaded to code execution container"
        )}
      </div>
      <div
        className={cn(
          "mt-2 text-muted-foreground/60 bg-secondary rounded p-2 overflow-x-auto",
          layout.monoText
        )}
      >
        <span className="opacity-70">{fileId}</span>
      </div>
    </ToolResultCard>
  );
});
