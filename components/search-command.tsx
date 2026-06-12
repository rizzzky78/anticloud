"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { search } from "@/actions/search";
import { getFileIcon } from "@/components/file-list-types";
import { FileMetaRecord } from "@/lib/file-meta";
import { Search, Loader2, ArrowRight } from "lucide-react";
import { formatBytes } from "@/lib/format";

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileMetaRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // ⌘K or Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  // Debounced search query
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await search({ query: query.trim() });
        setResults(res.results || []);
      } catch (err) {
        console.error("Quick search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  const handleSelectFile = (fileId: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(`/files/${fileId}`);
  };

  const handleSeeAll = () => {
    onOpenChange(false);
    setQuery("");
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false} title="Search Files" description="Quick search files by name, tags, or notes...">
      <CommandInput
        placeholder="Type to search files, tags, or mentions..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[300px]">
        {loading && (
          <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin mr-2" /> Searching database...
          </div>
        )}

        {!loading && results.length > 0 && (
          <CommandGroup heading="Matching Files">
            {results.slice(0, 5).map((file) => {
              const FileIcon = getFileIcon(file.mimeType);
              return (
                <CommandItem
                  key={file.id}
                  onSelect={() => handleSelectFile(file.id)}
                  className="flex items-center gap-2.5 py-2.5 cursor-pointer"
                >
                  <div className="p-1.5 rounded bg-muted text-muted-foreground group-data-selected/command-item:bg-background transition-colors">
                    <FileIcon className="size-4 shrink-0" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-semibold truncate leading-none mb-0.5">
                      {file.displayName}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {file.folderPath} • {formatBytes(file.size)}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {query.trim() && !loading && (
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={handleSeeAll}
              className="flex items-center gap-2 py-2.5 cursor-pointer text-primary font-medium"
            >
              <Search className="size-4 text-primary shrink-0" />
              <div className="flex-1 text-xs">
                See all results for &ldquo;{query.trim()}&rdquo;
              </div>
              <ArrowRight className="size-3.5 text-primary" />
            </CommandItem>
          </CommandGroup>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
            No files found matching &ldquo;{query}&rdquo;
          </CommandEmpty>
        )}

        {!query.trim() && (
          <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-1.5">
            <Search className="size-6 text-muted-foreground/30" />
            <p>Type a name, #tag, or @mention to start searching</p>
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
