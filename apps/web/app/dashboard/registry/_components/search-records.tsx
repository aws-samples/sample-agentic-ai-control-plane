"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Search, ExternalLink, AlertCircle } from "lucide-react";
import { $orpc } from "@/lib/api";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

type RegistryRecord = {
  registryArn: string;
  recordId?: string;
  recordArn?: string;
  name: string;
  protocol?: string;
  recordVersion?: string;
  descriptorType?: string;
  status?: string;
  description?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

interface SearchRecordsProps {
  registryArn: string;
  onViewDetails: (recordId: string) => void;
}

const PROTOCOL_COLORS: Record<string, string> = {
  MCP: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  A2A: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  CUSTOM: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export function SearchRecords({ registryArn, onViewDetails }: SearchRecordsProps) {
  const t = useTranslations("RegistryDetail.search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RegistryRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error(t("enterQuery"));
      return;
    }
    if (!registryArn) {
      toast.error(t("arnUnavailable"));
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);
    const startTime = Date.now();
    try {
      const response = await $orpc.searchRegistryRecords({
        registryIds: [registryArn],
        searchQuery: searchQuery.trim(),
        maxResults: 20,
      });
      setSearchResults(response.registryRecords || []);
      setSearchTime((Date.now() - startTime) / 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("searchFailed");
      setSearchError(message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const renderSearchBar = () => (
    <div className="flex gap-2">
      <div className="flex-1">
        <Input
          placeholder={t("placeholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSearching}
          className="text-base"
        />
      </div>
      <SearchButton isSearching={isSearching} disabled={!searchQuery.trim()} onClick={handleSearch} t={t} />
    </div>
  );

  return (
    <div className="px-4 space-y-4">
      {renderSearchBar()}
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {hasSearched && (
        <SearchResults
          searchTime={searchTime}
          searchError={searchError}
          isSearching={isSearching}
          searchResults={searchResults}
          searchQuery={searchQuery}
          onViewDetails={onViewDetails}
          t={t}
        />
      )}
      {!hasSearched && !isSearching && <SearchEmptyState t={t} />}
    </div>
  );
}

function SearchButton({ isSearching, disabled, onClick, t }: {
  isSearching: boolean;
  disabled: boolean;
  onClick: () => void;
  t: (key: string) => string;
}) {
  return (
    <Button onClick={onClick} disabled={isSearching || disabled} className="min-w-[100px]">
      {isSearching ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t("searching")}
        </>
      ) : (
        <>
          <Search className="mr-2 h-4 w-4" />
          {t("button")}
        </>
      )}
    </Button>
  );
}

function SearchEmptyState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
      <Search className="h-16 w-16 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">{t("emptyTitle")}</h3>
      <p className="text-muted-foreground max-w-md">{t("emptyDescription")}</p>
    </div>
  );
}

function SearchResults({ searchTime, searchError, isSearching, searchResults, searchQuery, onViewDetails, t }: {
  searchTime: number | null;
  searchError: string | null;
  isSearching: boolean;
  searchResults: RegistryRecord[];
  searchQuery: string;
  onViewDetails: (recordId: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="mt-6">
      {searchTime !== null && (
        <p className="text-sm text-muted-foreground mb-4">
          {t("resultsFound", { count: searchResults.length, time: searchTime.toFixed(2) })}
        </p>
      )}

      {searchError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{searchError}</AlertDescription>
        </Alert>
      )}

      {isSearching ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : searchResults.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
          <Search className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-2">
            {t("noResults", { query: searchQuery })}
          </p>
          <p className="text-sm text-muted-foreground">{t("noResultsHint")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {searchResults.map((result) => (
            <SearchResultCard key={result.recordId} result={result} onViewDetails={onViewDetails} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResultCard({ result, onViewDetails, t }: {
  result: RegistryRecord;
  onViewDetails: (recordId: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className="p-4 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer"
      onClick={() => result.recordId && onViewDetails(result.recordId)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg">{result.name}</h3>
            <Badge variant="outline" className={PROTOCOL_COLORS[result.protocol ?? "CUSTOM"] || PROTOCOL_COLORS.CUSTOM}>
              {result.protocol}
            </Badge>
            <Badge>{result.status}</Badge>
          </div>
          {result.description && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {result.description}
            </p>
          )}
          {result.recordVersion && (
            <span className="text-xs text-muted-foreground">v{result.recordVersion}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            result.recordId && onViewDetails(result.recordId);
          }}
        >
          {t("viewDetails")}
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
