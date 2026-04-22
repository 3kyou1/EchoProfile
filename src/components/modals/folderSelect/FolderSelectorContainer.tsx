import { FolderSelector } from "./FolderSelector";
import { useAppStore } from "@/store/useAppStore";
import { useModal } from "@/contexts/modal";
import { AppErrorType } from "@/types";
import { useEffect } from "react";

export const FolderSelectorContainer: React.FC = () => {
  const { isOpen, closeModal, folderSelectorMode, openModal } = useModal();
  const { setClaudePath, scanProjects, error } = useAppStore();

  useEffect(() => {
    if (error?.type === AppErrorType.CLAUDE_FOLDER_NOT_FOUND) {
      openModal("folderSelector", { mode: "notFound" });
    }
  }, [error, openModal]);

  const handleFolderSelected = async (path: string) => {
    let claudeFolderPath = path;
    if (!path.endsWith(".claude")) {
      claudeFolderPath = `${path}/.claude`;
    }

    setClaudePath(claudeFolderPath);
    try {
      await scanProjects();
    } catch (error) {
      console.error("Failed to scan projects:", error);
    }
  };

  if (!isOpen("folderSelector")) return null;

  return (
    <div className="fixed inset-0 z-50">
      <FolderSelector
        mode={folderSelectorMode}
        onClose={() => closeModal("folderSelector")}
        onFolderSelected={handleFolderSelected}
      />
    </div>
  );
};
