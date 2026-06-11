"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { searchUsers } from "@/actions/users";
import {
  CalendarIcon,
  Tag,
  User,
  FileText,
  X,
  Plus,
  Loader2,
  Filter,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";

interface SearchFiltersProps {
  className?: string;
}

const COMMON_MIME_TYPES = [
  { value: "all", label: "All File Types" },
  { value: "application/pdf", label: "PDF Document (.pdf)" },
  { value: "text/plain", label: "Plain Text (.txt)" },
  { value: "image/png", label: "PNG Image (.png)" },
  { value: "image/jpeg", label: "JPEG Image (.jpg)" },
  { value: "application/json", label: "JSON File (.json)" },
  { value: "application/zip", label: "ZIP Archive (.zip)" },
];

export function SearchFilters({ className }: SearchFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read current filters from URL
  const queryParam = searchParams.get("q") || "";
  const tagsParam = searchParams.get("tags") ? searchParams.get("tags")!.split(",") : [];
  const uploaderParam = searchParams.get("uploaderId") || "";
  const mimeParam = searchParams.get("mimeType") || "all";
  const startParam = searchParams.get("start") || "";
  const endParam = searchParams.get("end") || "";

  // Local state
  const [selectedTags, setSelectedTags] = useState<string[]>(tagsParam);
  const [selectedMime, setSelectedMime] = useState<string>(mimeParam);
  const [uploaderId, setUploaderId] = useState<string>(uploaderParam);
  const [uploaderName, setUploaderName] = useState<string>("");
  
  // Date range state
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (startParam || endParam) {
      return {
        from: startParam ? new Date(startParam) : undefined,
        to: endParam ? new Date(endParam) : undefined,
      };
    }
    return undefined;
  });

  // Autocomplete tags state
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);

  // Uploader search state
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [isUserPopoverOpen, setIsUserPopoverOpen] = useState(false);

  // Fetch tag suggestions as user types
  useEffect(() => {
    if (!tagInput.trim()) {
      setTagSuggestions([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setLoadingTags(true);
      try {
        const res = await fetch(`/api/tags/autocomplete?q=${encodeURIComponent(tagInput.trim().toLowerCase())}`);
        if (res.ok) {
          const data = await res.json();
          setTagSuggestions(data.suggestions || []);
        }
      } catch (err) {
        console.error("Tag autocomplete failed:", err);
      } finally {
        setLoadingTags(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [tagInput]);

  // Debounced uploader user search
  useEffect(() => {
    if (!userQuery.trim()) {
      setUserResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const users = await searchUsers(userQuery.trim());
        setUserResults(users || []);
      } catch (err) {
        console.error("User search failed:", err);
      } finally {
        setSearchingUsers(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [userQuery]);

  // Fetch uploader name if uploaderParam is set
  useEffect(() => {
    if (!uploaderParam) {
      setUploaderName("");
      return;
    }
    // We can run a small search or just use a placeholder
    const fetchUploaderName = async () => {
      try {
        const users = await searchUsers(uploaderParam);
        const match = users.find((u) => u.id === uploaderParam);
        if (match) {
          setUploaderName(match.name);
        } else {
          setUploaderName("Selected User");
        }
      } catch {
        setUploaderName("Selected User");
      }
    };
    fetchUploaderName();
  }, [uploaderParam]);

  // Apply filters by updating searchParams and pushing to router
  const applyFilters = (updates: {
    tags?: string[];
    mimeType?: string;
    uploaderId?: string | null;
    dateRange?: DateRange | null;
  }) => {
    const params = new URLSearchParams(searchParams.toString());

    // Tags
    if (updates.tags !== undefined) {
      if (updates.tags.length > 0) {
        params.set("tags", updates.tags.join(","));
      } else {
        params.delete("tags");
      }
    }

    // MIME Type
    if (updates.mimeType !== undefined) {
      if (updates.mimeType && updates.mimeType !== "all") {
        params.set("mimeType", updates.mimeType);
      } else {
        params.delete("mimeType");
      }
    }

    // Uploader ID
    if (updates.uploaderId !== undefined) {
      if (updates.uploaderId) {
        params.set("uploaderId", updates.uploaderId);
      } else {
        params.delete("uploaderId");
      }
    }

    // Date range
    if (updates.dateRange !== undefined) {
      if (updates.dateRange?.from) {
        params.set("start", updates.dateRange.from.toISOString().split("T")[0]);
      } else {
        params.delete("start");
      }
      if (updates.dateRange?.to) {
        params.set("end", updates.dateRange.to.toISOString().split("T")[0]);
      } else {
        params.delete("end");
      }
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleAddTag = (tag: string) => {
    const clean = tag.toLowerCase().trim();
    if (!clean || selectedTags.includes(clean)) return;
    const newTags = [...selectedTags, clean];
    setSelectedTags(newTags);
    setIsTagPopoverOpen(false);
    setTagInput("");
    applyFilters({ tags: newTags });
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = selectedTags.filter((t) => t !== tag);
    setSelectedTags(newTags);
    applyFilters({ tags: newTags });
  };

  const handleMimeChange = (mime: string) => {
    setSelectedMime(mime);
    applyFilters({ mimeType: mime });
  };

  const handleSelectUploader = (userId: string, name: string) => {
    setUploaderId(userId);
    setUploaderName(name);
    setIsUserPopoverOpen(false);
    setUserQuery("");
    applyFilters({ uploaderId: userId });
  };

  const handleRemoveUploader = () => {
    setUploaderId("");
    setUploaderName("");
    applyFilters({ uploaderId: null });
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    if (!range) {
      applyFilters({ dateRange: null });
    } else if (range.from && range.to) {
      applyFilters({ dateRange: range });
    }
  };

  const handleClearAll = () => {
    setSelectedTags([]);
    setSelectedMime("all");
    setUploaderId("");
    setUploaderName("");
    setDateRange(undefined);

    // Keep only the query param 'q'
    const params = new URLSearchParams();
    if (queryParam) {
      params.set("q", queryParam);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const hasActiveFilters =
    selectedTags.length > 0 ||
    selectedMime !== "all" ||
    uploaderId ||
    dateRange?.from ||
    dateRange?.to;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex items-center justify-between border-b pb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" /> Filters
        </h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="xs"
            onClick={handleClearAll}
            className="text-xs text-muted-foreground hover:text-foreground h-7"
          >
            <RefreshCw className="size-3 mr-1" /> Clear All
          </Button>
        )}
      </div>

      {/* Date Range Picker */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <CalendarIcon className="size-3.5" /> Date Uploaded
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-left font-normal border-b-input h-9 px-3"
            >
              <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}
                  </>
                ) : (
                  format(dateRange.from, "LLL dd, yyyy")
                )
              ) : (
                <span className="text-muted-foreground text-xs">Select date range...</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={handleDateRangeChange}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Tags Autocomplete */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Tag className="size-3.5" /> Filter by Tags
        </label>

        {/* Selected tags list */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-2 py-0.5 flex items-center gap-1"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/80 p-0.5 transition-colors"
                >
                  <X className="size-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <Popover open={isTagPopoverOpen} onOpenChange={setIsTagPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-left font-normal border-b-input h-9 px-3 text-muted-foreground"
            >
              <Plus className="mr-2 h-3.5 w-3.5" /> Add tag filter...
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search tag name..."
                value={tagInput}
                onValueChange={setTagInput}
              />
              <CommandList>
                {loadingTags && (
                  <div className="flex items-center justify-center p-3 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin mr-1.5" /> Searching...
                  </div>
                )}

                {!loadingTags && tagSuggestions.length > 0 && (
                  <CommandGroup heading="Suggestions">
                    {tagSuggestions.map((suggestion) => (
                      <CommandItem
                        key={suggestion}
                        onSelect={() => handleAddTag(suggestion)}
                        className="cursor-pointer"
                      >
                        #{suggestion}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {!loadingTags && tagInput.trim() && (
                  <CommandGroup heading="New filter">
                    <CommandItem
                      onSelect={() => handleAddTag(tagInput)}
                      className="text-primary font-medium cursor-pointer"
                    >
                      Filter by "#{tagInput.trim().toLowerCase()}"
                    </CommandItem>
                  </CommandGroup>
                )}

                {!tagInput.trim() && (
                  <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">
                    Type to search tags...
                  </CommandEmpty>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Uploader picker */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <User className="size-3.5" /> Uploaded By
        </label>

        {uploaderId ? (
          <div className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="size-5 shrink-0">
                <AvatarFallback className="text-[10px]">{getInitials(uploaderName)}</AvatarFallback>
              </Avatar>
              <span className="font-medium truncate">{uploaderName}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={handleRemoveUploader}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <Popover open={isUserPopoverOpen} onOpenChange={setIsUserPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-left font-normal border-b-input h-9 px-3 text-muted-foreground"
              >
                <User className="mr-2 h-3.5 w-3.5" /> Search uploader...
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search user name/email..."
                  value={userQuery}
                  onValueChange={setUserQuery}
                />
                <CommandList>
                  {searchingUsers && (
                    <div className="flex items-center justify-center p-3 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin mr-1.5" /> Searching...
                    </div>
                  )}

                  {!searchingUsers && userResults.length > 0 && (
                    <CommandGroup heading="People">
                      {userResults.map((user) => (
                        <CommandItem
                          key={user.id}
                          onSelect={() => handleSelectUploader(user.id, user.name)}
                          className="flex items-center gap-2 py-2 cursor-pointer"
                        >
                          <Avatar className="size-5">
                            {user.image && <AvatarImage src={user.image} alt={user.name} />}
                            <AvatarFallback className="text-[0.6rem]">
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
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

                  {!searchingUsers && userQuery.trim() && userResults.length === 0 && (
                    <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">
                      No users found
                    </CommandEmpty>
                  )}

                  {!userQuery.trim() && (
                    <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">
                      Type to search user...
                    </CommandEmpty>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* File type selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="size-3.5" /> File Type
        </label>
        <Select value={selectedMime} onValueChange={handleMimeChange}>
          <SelectTrigger className="w-full h-9 border-b-input text-xs">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {COMMON_MIME_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value} className="text-xs">
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
