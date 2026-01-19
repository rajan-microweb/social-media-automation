import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Trash2, Clock, X, CheckSquare } from "lucide-react";
import { useState } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { Input } from "@/components/ui/input";

interface BulkActionToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkStatusChange: (status: string) => void;
  onBulkSchedule: (date: Date) => void;
  isLoading?: boolean;
}

export function BulkActionToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onBulkDelete,
  onBulkStatusChange,
  onBulkSchedule,
  isLoading = false,
}: BulkActionToolbarProps) {
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const handleScheduleConfirm = () => {
    if (scheduleDate) {
      const [hours, minutes] = scheduleTime.split(":").map(Number);
      const dateWithTime = setMinutes(setHours(scheduleDate, hours), minutes);
      onBulkSchedule(dateWithTime);
      setScheduleOpen(false);
      setScheduleDate(undefined);
      setScheduleTime("12:00");
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
      {/* Selection Info */}
      <div className="flex items-center gap-2">
        <CheckSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {selectedCount} of {totalCount} selected
        </span>
      </div>

      {/* Select All / Clear */}
      {selectedCount < totalCount ? (
        <Button variant="ghost" size="sm" onClick={onSelectAll}>
          Select All
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          Clear Selection
        </Button>
      )}

      <div className="h-4 w-px bg-border" />

      {/* Bulk Delete */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={isLoading}>
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} items?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              selected items and their associated media.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onBulkDelete}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Status */}
      <Select
        disabled={isLoading}
        onValueChange={onBulkStatusChange}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Change Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="draft">Set to Draft</SelectItem>
          <SelectItem value="scheduled">Set to Scheduled</SelectItem>
          <SelectItem value="published">Set to Published</SelectItem>
        </SelectContent>
      </Select>

      {/* Schedule */}
      <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={isLoading}>
            <Clock className="mr-1 h-4 w-4" />
            Schedule
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
          <div className="p-3 space-y-3">
            <Calendar
              mode="single"
              selected={scheduleDate}
              onSelect={setScheduleDate}
              disabled={(date) => date < new Date()}
              className="pointer-events-auto"
            />
            <div className="flex items-center gap-2 px-1">
              <label className="text-sm text-muted-foreground">Time:</label>
              <Input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-auto"
              />
            </div>
            {scheduleDate && (
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {format(scheduleDate, "PPP")} at {scheduleTime}
                </span>
                <Button size="sm" onClick={handleScheduleConfirm}>
                  Confirm
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Close */}
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto"
        onClick={onClearSelection}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
