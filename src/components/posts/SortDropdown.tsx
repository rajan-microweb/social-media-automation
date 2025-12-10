import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export type SortField = "created_at" | "scheduled_at" | "status" | "title";
export type SortOrder = "asc" | "desc";

interface SortDropdownProps {
  sortBy: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField, order: SortOrder) => void;
  showTitle?: boolean;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "created_at", label: "Created Date" },
  { value: "scheduled_at", label: "Scheduled Date" },
  { value: "status", label: "Status" },
  { value: "title", label: "Title" },
];

export function SortDropdown({
  sortBy,
  sortOrder,
  onSortChange,
  showTitle = true,
}: SortDropdownProps) {
  const currentLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label || "Sort";

  const toggleOrder = () => {
    onSortChange(sortBy, sortOrder === "asc" ? "desc" : "asc");
  };

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <ArrowUpDown className="mr-2 h-4 w-4" />
            {showTitle && currentLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onSortChange(option.value, sortOrder)}
              className={sortBy === option.value ? "bg-accent" : ""}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon" onClick={toggleOrder}>
        {sortOrder === "asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
