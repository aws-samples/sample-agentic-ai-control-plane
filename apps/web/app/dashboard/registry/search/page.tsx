"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { $orpc } from "@/lib/api";
import { AlertCircle, ExternalLink, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Registry = {
  name: string;
  description?: string;
  registryId: string;
  registryArn: string;
  status:
    | "CREATING"
    | "CREATE_FAILED"
    | "READY"
    | "UPDATING"
    | "UPDATE_FAILED"
    | "DELETING"
    | "DELETE_FAILED";
  createdAt?: string | Date;
  updatedAt: string | Date;
};

type SearchResult = {
  registryArn: string;
  recordId?: string;
  recordArn?: string;
  name: string;
  recordVersion?: string;
  descriptorType?: string;
  status?: string;
  description?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export default function SearchPage() {
  const router = useRouter();
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [selectedRegistries, setSelectedRegistries] = useState<Set<string>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoadingRegistries, setIsLoadingRegistries] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Fetch registries on mount
  useEffect(() => {
    const fetchRegistries = async () => {
      setIsLoadingRegistries(true);
      try {
        const response = await $orpc.listRegistries();
        const readyRegistries = response.registries.filter(
          (r) => r.status === "READY",
        );
        setRegistries(readyRegistries);

        // Auto-select all registries
        if (readyRegistries.length > 0) {
          setSelectedRegistries(
            new Set(readyRegistries.map((r) => r.registryArn)),
          );
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load registries");
        console.error("Error fetching registries:", err);
      } finally {
        setIsLoadingRegistries(false);
      }
    };

    fetchRegistries();
  }, []);

  const handleRegistryToggle = (registryArn: string) => {
    setSelectedRegistries((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(registryArn)) {
        newSet.delete(registryArn);
      } else {
        newSet.add(registryArn);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedRegistries.size === registries.length) {
      setSelectedRegistries(new Set());
    } else {
      setSelectedRegistries(new Set(registries.map((r) => r.registryArn)));
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    if (selectedRegistries.size === 0) {
      toast.error("Please select at least one registry");
      return;
    }

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    const startTime = Date.now();

    try {
      const response = await $orpc.searchRegistryRecords({
        registryIds: Array.from(selectedRegistries),
        searchQuery: searchQuery.trim(),
        maxResults: 20,
      });

      setResults(response.registryRecords || []);
      setSearchTime((Date.now() - startTime) / 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      console.error("Error searching:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getRegistryNameFromArn = (arn: string) => {
    const registry = registries.find((r) => r.registryArn === arn);
    return registry?.name || arn.split("/").pop() || arn;
  };

  const getProtocolBadge = (protocol: string) => {
    const colors: Record<string, string> = {
      MCP: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      A2A: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
      CUSTOM: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    };

    return (
      <Badge variant="outline" className={colors[protocol] || colors.CUSTOM}>
        {protocol}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge
        variant="default"
        className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
      >
        {status}
      </Badge>
    );
  };

  const handleViewDetails = (result: SearchResult) => {
    const registryId = result.registryArn.split("/").pop();
    router.push(`/dashboard/registry/${registryId}/records/${result.recordId}`);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Registry Selector Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Select Registries to Search</CardTitle>
              <CardDescription>
                Choose one or more registries to search. Only APPROVED records
                are searchable.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {selectedRegistries.size === registries.length
                ? "Deselect All"
                : "Select All"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingRegistries ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : registries.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No registries available. Create a registry first to enable
                search.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {registries.map((registry) => (
                <div
                  key={registry.registryArn}
                  className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => handleRegistryToggle(registry.registryArn)}
                >
                  <Checkbox
                    checked={selectedRegistries.has(registry.registryArn)}
                    onCheckedChange={() =>
                      handleRegistryToggle(registry.registryArn)
                    }
                    id={registry.registryArn}
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={registry.registryArn}
                      className="font-medium cursor-pointer block"
                    >
                      {registry.name}
                    </Label>
                    {registry.description && (
                      <p className="text-sm text-muted-foreground truncate">
                        {registry.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {selectedRegistries.size > 0 && (
            <p className="text-sm text-muted-foreground mt-4">
              {selectedRegistries.size}{" "}
              {selectedRegistries.size === 1 ? "registry" : "registries"}{" "}
              selected
            </p>
          )}
        </CardContent>
      </Card>

      {/* Search Bar Card */}
      <Card>
        <CardHeader>
          <CardTitle>Search Agents & Tools</CardTitle>
          <CardDescription>
            Use natural language to discover approved agents and tools across
            selected registries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="e.g., process payment, send email, analyze data..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isSearching || selectedRegistries.size === 0}
                className="text-base"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={
                isSearching ||
                !searchQuery.trim() ||
                selectedRegistries.size === 0
              }
              className="min-w-[100px]"
            >
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Card */}
      {hasSearched && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Search Results</CardTitle>
                {searchTime !== null && (
                  <CardDescription>
                    Found {results.length} result
                    {results.length !== 1 ? "s" : ""} in {searchTime.toFixed(2)}
                    s
                  </CardDescription>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isSearching ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">
                  No approved records found for &ldquo;{searchQuery}&rdquo;
                </p>
                <p className="text-sm text-muted-foreground">
                  Try different keywords or check that records are approved
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((result) => (
                  <div
                    key={result.recordId}
                    className="p-4 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => handleViewDetails(result)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">
                            {result.name}
                          </h3>
                          {getProtocolBadge(result.descriptorType || "")}
                          {getStatusBadge(result.status ?? "")}
                        </div>
                        {result.description && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                            {result.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            Registry:{" "}
                            {getRegistryNameFromArn(result.registryArn)}
                          </span>
                          {result.recordVersion && (
                            <>
                              <span>•</span>
                              <span>v{result.recordVersion}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetails(result);
                        }}
                      >
                        View Details
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty State - No search yet */}
      {!hasSearched && !isSearching && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              Discover Agents & Tools
            </h3>
            <p className="text-muted-foreground max-w-md">
              Select registries above and enter a search query to find approved
              agents and tools using natural language
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
