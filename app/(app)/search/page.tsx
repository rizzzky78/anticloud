import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { searchFiles, SearchFilters as ISearchFilters } from "@/lib/search";
import { listUserFolderPaths } from "@/lib/file-list";
import { db } from "@/lib/db";
import { FileList } from "@/components/file-list";
import { SearchFilters } from "@/components/search-filters";
import { SearchInput } from "@/components/search-input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Search, SlidersHorizontal, X, FileSearch, ArrowRight } from "lucide-react";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    tags?: string;
    uploaderId?: string;
    mimeType?: string;
    start?: string;
    end?: string;
  }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/sign-in");
  }

  const {
    q = "",
    tags = "",
    uploaderId = "",
    mimeType = "",
    start = "",
    end = "",
  } = await searchParams;

  const user = { id: session.user.id, role: session.user.role as string };

  // 1. Build search filters
  const filters: ISearchFilters = {};
  if (tags) filters.tags = tags.split(",").map((t) => t.trim().toLowerCase());
  if (uploaderId) filters.uploaderId = uploaderId;
  if (mimeType && mimeType !== "all") filters.mimeType = mimeType;
  if (start || end) {
    filters.dateRange = {
      start: start || undefined,
      end: end || undefined,
    };
  }

  // 2. Fetch search results, folder paths and uploader name (if uploaderId set)
  const [results, folderPaths, uploaderUser] = await Promise.all([
    searchFiles(user.id, q, filters),
    listUserFolderPaths(user),
    uploaderId
      ? db.user.findUnique({
          where: { id: uploaderId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  // Helper to construct clear-filter urls
  const getFilterClearUrl = (type: "tag" | "mime" | "uploader" | "date", val?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    
    // Add other active parameters back
    if (type !== "tag" && tags) params.set("tags", tags);
    if (type === "tag" && tags && val) {
      const remaining = tags
        .split(",")
        .filter((t) => t.trim().toLowerCase() !== val.toLowerCase())
        .join(",");
      if (remaining) params.set("tags", remaining);
    }

    if (type !== "mime" && mimeType) params.set("mimeType", mimeType);
    if (type !== "uploader" && uploaderId) params.set("uploaderId", uploaderId);
    
    if (type !== "date") {
      if (start) params.set("start", start);
      if (end) params.set("end", end);
    }

    return `/search?${params.toString()}`;
  };

  const hasActiveFilters = !!tags || !!uploaderId || (!!mimeType && mimeType !== "all") || !!start || !!end;
  const showResults = !!q || hasActiveFilters;

  return (
    <div className="flex flex-col flex-1 p-6 gap-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Search Archive</h1>
        <p className="text-xs text-muted-foreground">
          Perform indexed full-text search across file names, tag contents, mentions, and collaborative notes.
        </p>
      </div>

      {/* Search Bar & Mobile Filters trigger */}
      <div className="flex items-center gap-3">
        <SearchInput className="flex-1" placeholder="Type keywords, e.g. 'invoice', 'report'..." />
        
        {/* Mobile Filters Trigger */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="lg:hidden shrink-0 h-10 w-10 border-b-input">
              <SlidersHorizontal className="size-4" />
              <span className="sr-only">Filters</span>
            </Button>
          </SheetTrigger>
          <SheetContent className="w-80 overflow-y-auto">
            <SheetHeader className="mb-4">
              <SheetTitle>Search Filters</SheetTitle>
            </SheetHeader>
            <SearchFilters />
          </SheetContent>
        </Sheet>
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Active filters:
          </span>
          
          {/* Tags */}
          {tags &&
            tags.split(",").map((tag) => (
              <Button key={tag} variant="secondary" size="xs" className="h-6 rounded-full text-[10px] gap-1 px-2.5" asChild>
                <Link href={getFilterClearUrl("tag", tag.trim())}>
                  #{tag.trim()}
                  <X className="size-3 text-muted-foreground hover:text-foreground" />
                </Link>
              </Button>
            ))}

          {/* Mime Type */}
          {mimeType && mimeType !== "all" && (
            <Button variant="secondary" size="xs" className="h-6 rounded-full text-[10px] gap-1 px-2.5" asChild>
              <Link href={getFilterClearUrl("mime")}>
                Type: {mimeType.split("/")[1] || mimeType}
                <X className="size-3 text-muted-foreground hover:text-foreground" />
              </Link>
            </Button>
          )}

          {/* Uploader */}
          {uploaderId && uploaderUser && (
            <Button variant="secondary" size="xs" className="h-6 rounded-full text-[10px] gap-1 px-2.5" asChild>
              <Link href={getFilterClearUrl("uploader")}>
                By: {uploaderUser.name}
                <X className="size-3 text-muted-foreground hover:text-foreground" />
              </Link>
            </Button>
          )}

          {/* Date range */}
          {(start || end) && (
            <Button variant="secondary" size="xs" className="h-6 rounded-full text-[10px] gap-1 px-2.5" asChild>
              <Link href={getFilterClearUrl("date")}>
                Uploaded: {start ? format(new Date(start), "LLL dd") : ""}
                {start && end ? " - " : ""}
                {end ? format(new Date(end), "LLL dd") : ""}
                <X className="size-3 text-muted-foreground hover:text-foreground" />
              </Link>
            </Button>
          )}
        </div>
      )}

      {/* Two Column Layout (Results + Desktop Sidebar) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start flex-1">
        {/* Results Area */}
        <div className="lg:col-span-3 flex flex-col flex-1 h-full min-h-[400px]">
          {!showResults ? (
            <Card className="flex flex-col items-center justify-center flex-1 py-16 text-center border-dashed rounded-2xl bg-muted/5">
              <CardContent className="space-y-4 max-w-md">
                <div className="flex justify-center">
                  <div className="p-4 bg-muted/50 rounded-2xl border text-muted-foreground/60 shadow-xs">
                    <Search className="size-10" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-base">Start searching your archive</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Type a query above or choose a filter from the panel to find files. Your query searches display names, tags, mentions, and collaborative notes.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : results.length === 0 ? (
            <Card className="flex flex-col items-center justify-center flex-1 py-16 text-center border-dashed rounded-2xl bg-muted/5">
              <CardContent className="space-y-4 max-w-md">
                <div className="flex justify-center">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl shadow-xs">
                    <FileSearch className="size-10" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-base">No results found</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    We couldn't find any files matching your search. Try adjusting your search keywords or clearing some filters to expand your search.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Results matching search ({results.length})
              </div>
              <FileList
                files={results}
                userId={session.user.id}
                userRole={session.user.role as string}
                folderPaths={folderPaths}
              />
            </div>
          )}
        </div>

        {/* Desktop Sidebar Filters */}
        <div className="hidden lg:block lg:col-span-1 border rounded-xl p-5 bg-card shadow-xs">
          <SearchFilters />
        </div>
      </div>
    </div>
  );
}
