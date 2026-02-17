"use client";

import type { StreamEvent, SearchResultsData } from "@/lib/stream/types";
import { SearchResults } from "../SearchResults";

interface SearchResultsEventProps {
  event: StreamEvent;
}

export function SearchResultsEvent({ event }: SearchResultsEventProps) {
  const data = event.data as SearchResultsData;

  return (
    <div className="animate-in fade-in duration-200 max-w-[95%]">
      <SearchResults
        results={data.results}
        query={data.query}
        followUpSuggestions={data.followUpSuggestions}
      />
    </div>
  );
}
