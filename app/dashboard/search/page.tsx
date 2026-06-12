import { SearchUI } from "@/components/search-ui";
import { Suspense } from "react";

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">Search</h1>
        <SearchUI />
      </div>
    </Suspense>
  );
}
