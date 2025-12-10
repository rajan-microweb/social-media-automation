import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Search, X, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";

interface FilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string | null;
  onStatusChange: (value: string | null) => void;
  platformFilter: string[];
  onPlatformChange: (platforms: string[]) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  availablePlatforms?: string[];
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
];

const DEFAULT_PLATFORMS = ["LinkedIn", "Instagram", "Twitter", "YouTube"];

export function FilterBar({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  platformFilter,
  onPlatformChange,
  dateRange,
  onDateRangeChange,
  availablePlatforms = DEFAULT_PLATFORMS,
}: FilterBarProps) {
  const hasActiveFilters =
    searchTerm ||
    statusFilter ||
    platformFilter.length > 0 ||
    dateRange?.from ||
    dateRange?.to;

  const clearAllFilters = () => {
    onSearchChange("");
    onStatusChange(null);
    onPlatformChange([]);
    onDateRangeChange(undefined);
  };

  const togglePlatform = (platform: string) => {
    if (platformFilter.includes(platform)) {
      onPlatformChange(platformFilter.filter((p) => p !== platform));
    } else {
      onPlatformChange([...platformFilter, platform]);
    }
  };

  return (
    <div className="flex flex-wrap gap-3 items-center p-4 bg-card rounded-lg border">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Status Filter */}
      <Select
        value={statusFilter || "all"}
        onValueChange={(v) => onStatusChange(v === "all" ? null : v)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Platform Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-[120px]">
            Platforms
            {platformFilter.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {platformFilter.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-2">
          <div className="space-y-1">
            {availablePlatforms.map((platform) => (
              <Button
                key={platform}
                variant={platformFilter.includes(platform) ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start"
                onClick={() => togglePlatform(platform)}
              >
                {platform}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Date Range Picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-[140px]">
            <CalendarDays className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                </>
              ) : (
                format(dateRange.from, "MMM d, yyyy")
              )
            ) : (
              "Date Range"
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={onDateRangeChange}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAllFilters}>
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
