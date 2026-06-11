"use client";

import { useState } from "react";
import { search } from "@/actions/search";
import { FileMetaRecord } from "@/lib/file-meta";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileList } from "@/components/file-list";
import { Search, Loader2 } from "lucide-react";

export function SearchUI() {
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [results, setResults] = useState<FileMetaRecord[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const filters: any = {};
      if (tags.trim()) filters.tags = tags.split(",").map((t) => t.trim());
      if (mimeType.trim()) filters.mimeType = mimeType.trim();

      const { results: newResults } = await search({ query, filters });
      setResults(newResults);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Search Files</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search by name, tag, or mention..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                Search
              </Button>
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium">Tags (comma separated)</label>
                <Input
                  placeholder="e.g. invoice, urgent"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">File Type</label>
                <Input
                  placeholder="e.g. image/png"
                  value={mimeType}
                  onChange={(e) => setMimeType(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Results ({results.length})</h2>
          <FileList files={results} />
        </div>
      )}

      {results.length === 0 && query && !loading && (
        <div className="text-center text-muted-foreground py-8">
          No files found matching your search.
        </div>
      )}
    </div>
  );
}
