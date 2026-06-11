import { EmptyState } from "@/components/empty-state";
import { FolderIcon } from "lucide-react";

export default function FilesPage() {
  return (
    <div className="flex flex-1 flex-col p-6">
      <EmptyState
        icon={<FolderIcon />}
        title="Your Files"
        description="Your files will appear here. Upload something to get started."
      />
    </div>
  );
}
