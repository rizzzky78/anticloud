"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OPTIONS = [
  { value: "date:desc", label: "Newest first" },
  { value: "date:asc", label: "Oldest first" },
  { value: "name:asc", label: "Name (A–Z)" },
  { value: "name:desc", label: "Name (Z–A)" },
  { value: "size:desc", label: "Largest first" },
  { value: "size:asc", label: "Smallest first" },
];

/** File browser sort control; persists the choice in the URL. */
export function SortSelect({ sort, dir }: { sort: string; dir: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (value: string) => {
    const [nextSort, nextDir] = value.split(":");
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", nextSort);
    params.set("dir", nextDir);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <Select value={`${sort}:${dir}`} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-40">
        <ArrowDownUp className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
