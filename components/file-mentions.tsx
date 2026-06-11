"use client";

import { useState, useEffect, useTransition } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/badge"; // Wait, avatar components in components/ui/avatar.tsx
import { Avatar as UiAvatar, AvatarImage as UiAvatarImage, AvatarFallback as UiAvatarFallback } from "@/components/ui/avatar";
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
import { addMention, removeMention } from "@/actions/mentions";
import { searchUsers } from "@/actions/users";
import { AtSign, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MentionedUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string | null;
}

interface FileMentionsProps {
  fileId: string;
  initialMentions: MentionedUser[];
  isMentionRestricted?: boolean;
  canManageMentions?: boolean;
}

export function FileMentions({
  fileId,
  initialMentions = [],
  isMentionRestricted = false,
  canManageMentions = true,
}: FileMentionsProps) {
  const [mentions, setMentions] = useState<MentionedUser[]>(initialMentions);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MentionedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMentions(initialMentions);
  }, [initialMentions]);

  // Search users as search input changes
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await searchUsers(query.trim());
        // Filter out already mentioned users
        const filtered = users.filter((u) => !mentions.some((m) => m.id === u.id));
        setSearchResults(filtered);
      } catch (err) {
        console.error("Failed to search users", err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [query, mentions]);

  const handleAddMention = (user: MentionedUser) => {
    startTransition(async () => {
      try {
        await addMention({ fileId, mentionedUserId: user.id });
        setMentions((prev) => [...prev, user]);
        toast.success(`Mentioned ${user.name}`);
        setQuery("");
        setOpen(false);
      } catch (err: any) {
        toast.error(err?.message || "Failed to mention user");
      }
    });
  };

  const handleRemoveMention = (userId: string, userName: string) => {
    startTransition(async () => {
      try {
        await removeMention({ fileId, mentionedUserId: userId });
        setMentions((prev) => prev.filter((m) => m.id !== userId));
        toast.success(`Removed mention for ${userName}`);
      } catch (err: any) {
        toast.error(err?.message || "Failed to remove mention");
      }
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <AtSign className="size-3.5" /> Mentions
        </h3>
        {canManageMentions && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-xs" disabled={isPending}>
                <Plus className="size-3.5" />
                <span className="sr-only">Add mention</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search user by name/email..."
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  {loading && (
                    <div className="flex items-center justify-center p-3 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin mr-1.5" /> Searching...
                    </div>
                  )}

                  {!loading && searchResults.length > 0 && (
                    <CommandGroup heading="People">
                      {searchResults.map((user) => (
                        <CommandItem
                          key={user.id}
                          onSelect={() => handleAddMention(user)}
                          className="flex items-center gap-2 py-2"
                        >
                          <UiAvatar className="size-5">
                            {user.image && <UiAvatarImage src={user.image} alt={user.name} />}
                            <UiAvatarFallback className="text-[0.6rem]">
                              {getInitials(user.name)}
                            </UiAvatarFallback>
                          </UiAvatar>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium truncate">{user.name}</span>
                            <span className="text-[0.65rem] text-muted-foreground truncate">
                              {user.username ? `@${user.username}` : user.email}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {!loading && query.trim() && searchResults.length === 0 && (
                    <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">
                      No users found
                    </CommandEmpty>
                  )}

                  {!query.trim() && (
                    <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">
                      Type to search a user
                    </CommandEmpty>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {mentions.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-2 p-1.5 rounded-lg border bg-card text-card-foreground group"
          >
            <UiAvatar className="size-6 shrink-0">
              {user.image && <UiAvatarImage src={user.image} alt={user.name} />}
              <UiAvatarFallback className="text-[0.65rem]">{getInitials(user.name)}</UiAvatarFallback>
            </UiAvatar>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-medium truncate leading-none">{user.name}</span>
              <span className="text-[0.65rem] text-muted-foreground truncate mt-0.5">
                {user.username ? `@${user.username}` : user.email}
              </span>
            </div>
            {canManageMentions && (
              <button
                type="button"
                onClick={() => handleRemoveMention(user.id, user.name)}
                disabled={isPending}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive rounded-sm p-0.5 transition-all"
                aria-label={`Remove mention for ${user.name}`}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        ))}

        {mentions.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No mentions added yet</span>
        )}

        {isMentionRestricted && (
          <p className="text-[0.7rem] text-purple-600 dark:text-purple-400 leading-normal bg-purple-500/10 p-2 rounded border border-purple-500/20 mt-1">
            ℹ️ Access to this file is gated: only users mentioned here or who have explicit permission grants can view it.
          </p>
        )}
      </div>
    </div>
  );
}
