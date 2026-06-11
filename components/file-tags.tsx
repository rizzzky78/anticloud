"use client";

import { useState, useEffect, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { addTag, removeTag } from "@/actions/tags";
import { Tag as TagIcon, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FileTagsProps {
  fileId: string;
  initialTags: string[];
  isReadOnly?: boolean;
  canEdit?: boolean;
}

export function FileTags({
  fileId,
  initialTags = [],
  isReadOnly = false,
  canEdit = true,
}: FileTagsProps) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Reset tags when initialTags changes
  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  // Fetch autocomplete suggestions as the user types
  useEffect(() => {
    if (!inputValue.trim()) {
      setSuggestions([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(
          `/api/tags/autocomplete?q=${encodeURIComponent(inputValue.trim().toLowerCase())}`
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch (err) {
        console.error("Failed to fetch tag suggestions", err);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [inputValue]);

  const handleAddTag = (tagVal: string) => {
    const cleanTag = tagVal.trim().toLowerCase();
    if (!cleanTag) return;
    
    // Tag validation: letters, numbers, hyphens, underscores, 1-64 chars
    if (!/^[\w\-]+$/.test(cleanTag)) {
      toast.error("Tags may only contain letters, numbers, hyphens and underscores");
      return;
    }

    if (tags.includes(cleanTag)) {
      toast.error("Tag is already added");
      setOpen(false);
      setInputValue("");
      return;
    }

    startTransition(async () => {
      try {
        await addTag({ fileId, value: cleanTag });
        setTags((prev) => [...prev, cleanTag]);
        toast.success(`Tag "${cleanTag}" added`);
        setInputValue("");
        setOpen(false);
      } catch (err: any) {
        toast.error(err?.message || "Failed to add tag");
      }
    });
  };

  const handleRemoveTag = (tagVal: string) => {
    if (isReadOnly || !canEdit) return;

    startTransition(async () => {
      try {
        await removeTag({ fileId, value: tagVal });
        setTags((prev) => prev.filter((t) => t !== tagVal));
        toast.success(`Tag "${tagVal}" removed`);
      } catch (err: any) {
        toast.error(err?.message || "Failed to remove tag");
      }
    });
  };

  const showAddControl = canEdit && !isReadOnly;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <TagIcon className="size-3.5" /> Tags
        </h3>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="group/tag flex items-center gap-1 text-xs px-2 py-0.5"
          >
            #{tag}
            {showAddControl && (
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                disabled={isPending}
                className="text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/80 p-0.5 transition-colors"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="size-3" />
              </button>
            )}
          </Badge>
        ))}

        {tags.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No tags added yet</span>
        )}

        {showAddControl && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                className="h-6 rounded-full border-dashed px-2 py-1 text-xs gap-1"
                disabled={isPending}
              >
                <Plus className="size-3" /> Add Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Type a tag..."
                  value={inputValue}
                  onValueChange={setInputValue}
                />
                <CommandList>
                  {loadingSuggestions && (
                    <div className="flex items-center justify-center p-3 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin mr-1.5" /> Loading...
                    </div>
                  )}

                  {!loadingSuggestions && suggestions.length > 0 && (
                    <CommandGroup heading="Suggestions">
                      {suggestions.map((suggestion) => (
                        <CommandItem
                          key={suggestion}
                          onSelect={() => handleAddTag(suggestion)}
                        >
                          #{suggestion}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {!loadingSuggestions && inputValue.trim() && (
                    <CommandGroup heading="Create Tag">
                      <CommandItem
                        onSelect={() => handleAddTag(inputValue)}
                        className="text-primary font-medium"
                      >
                        Create "#{inputValue.trim().toLowerCase()}"
                      </CommandItem>
                    </CommandGroup>
                  )}

                  {!inputValue.trim() && (
                    <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">
                      Type to search or create a tag
                    </CommandEmpty>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
