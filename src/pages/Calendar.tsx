import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isSameMonth,
  isSameDay,
  parseISO,
  startOfDay,
  endOfDay,
  isWithinInterval,
  getHours,
  getMinutes,
} from "date-fns";
import { ChevronLeft, ChevronRight, FileText, Image } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ViewType = "month" | "week" | "day";

interface CalendarEvent {
  id: string;
  title: string;
  scheduled_at: string;
  type: "post" | "story";
  status: string;
  platforms?: string[];
  type_of_post?: string;
  type_of_story?: string;
}

export default function Calendar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("month");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchEvents();
    }
  }, [user, currentDate, view]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      // Fetch scheduled posts
      const { data: posts, error: postsError } = await supabase
        .from("posts")
        .select("id, title, scheduled_at, status, platforms, type_of_post")
        .eq("user_id", user?.id)
        .not("scheduled_at", "is", null);

      if (postsError) throw postsError;

      // Fetch scheduled stories
      const { data: stories, error: storiesError } = await supabase
        .from("stories")
        .select("id, title, scheduled_at, status, platforms, type_of_story")
        .eq("user_id", user?.id)
        .not("scheduled_at", "is", null);

      if (storiesError) throw storiesError;

      const postEvents: CalendarEvent[] = (posts || []).map((p) => ({
        id: p.id,
        title: p.title,
        scheduled_at: p.scheduled_at!,
        type: "post",
        status: p.status,
        platforms: p.platforms || [],
        type_of_post: p.type_of_post || undefined,
      }));

      const storyEvents: CalendarEvent[] = (stories || []).map((s) => ({
        id: s.id,
        title: s.title,
        scheduled_at: s.scheduled_at!,
        type: "story",
        status: s.status,
        platforms: s.platforms || [],
        type_of_story: s.type_of_story || undefined,
      }));

      setEvents([...postEvents, ...storyEvents]);
    } catch (error) {
      console.error("Error fetching events:", error);
      toast({
        title: "Error",
        description: "Failed to load calendar events",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const navigatePrev = () => {
    if (view === "month") setCurrentDate(subMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, -1));
  };

  const navigateNext = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

  const getEventsForDay = (day: Date) => {
    return events.filter((event) =>
      isSameDay(parseISO(event.scheduled_at), day)
    );
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (event.type === "post") {
      navigate(`/posts/${event.id}/edit`);
    } else {
      navigate(`/stories/${event.id}/edit`);
    }
  };

  const renderEventChip = (event: CalendarEvent, compact = false) => {
    const isPost = event.type === "post";
    const time = format(parseISO(event.scheduled_at), "HH:mm");

    return (
      <Tooltip key={event.id}>
        <TooltipTrigger asChild>
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleEventClick(event);
            }}
            className={`
              cursor-pointer rounded px-1.5 py-0.5 text-xs truncate mb-0.5
              transition-all hover:opacity-80
              ${isPost 
                ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-l-2 border-blue-500" 
                : "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-l-2 border-purple-500"
              }
            `}
          >
            {compact ? (
              <span className="flex items-center gap-1">
                {isPost ? <FileText className="h-3 w-3" /> : <Image className="h-3 w-3" />}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="font-medium">{time}</span>
                <span className="truncate">{event.title}</span>
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{event.title}</p>
            <p className="text-xs text-muted-foreground">
              {format(parseISO(event.scheduled_at), "PPp")}
            </p>
            <div className="flex items-center gap-2">
              <Badge variant={event.type === "post" ? "default" : "secondary"}>
                {event.type === "post" ? "Post" : "Story"}
              </Badge>
              <Badge variant="outline">{event.status}</Badge>
            </div>
            {event.platforms && event.platforms.length > 0 && (
              <p className="text-xs">Platforms: {event.platforms.join(", ")}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  // Month View
  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    // Header row with day names
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const currentDay = day;
        const dayEvents = getEventsForDay(currentDay);
        const isToday = isSameDay(currentDay, new Date());
        const isCurrentMonth = isSameMonth(currentDay, monthStart);

        days.push(
          <div
            key={day.toString()}
            className={`
              min-h-[100px] p-1 border border-border/50
              ${!isCurrentMonth ? "bg-muted/30" : "bg-card"}
              ${isToday ? "ring-2 ring-primary ring-inset" : ""}
            `}
          >
            <div className={`
              text-sm font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
              ${isToday ? "bg-primary text-primary-foreground" : ""}
              ${!isCurrentMonth ? "text-muted-foreground" : ""}
            `}>
              {format(currentDay, "d")}
            </div>
            <div className="space-y-0.5 overflow-hidden max-h-[70px]">
              {dayEvents.slice(0, 3).map((event) => renderEventChip(event))}
              {dayEvents.length > 3 && (
                <div className="text-xs text-muted-foreground px-1">
                  +{dayEvents.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toString()} className="grid grid-cols-7">
          {days}
        </div>
      );
      days = [];
    }

    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-7 bg-muted">
          {dayNames.map((name) => (
            <div key={name} className="p-2 text-center text-sm font-medium text-muted-foreground">
              {name}
            </div>
          ))}
        </div>
        {rows}
      </div>
    );
  };

  // Week View
  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate);
    const days = [];
    const hours = Array.from({ length: 24 }, (_, i) => i);

    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i));
    }

    return (
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-muted">
          <div className="p-2 border-r border-border" />
          {days.map((day) => (
            <div
              key={day.toString()}
              className={`
                p-2 text-center border-r border-border last:border-r-0
                ${isSameDay(day, new Date()) ? "bg-primary/10" : ""}
              `}
            >
              <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
              <div className={`
                text-lg font-semibold w-8 h-8 mx-auto flex items-center justify-center rounded-full
                ${isSameDay(day, new Date()) ? "bg-primary text-primary-foreground" : ""}
              `}>
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>
        {/* Time grid */}
        <div className="max-h-[600px] overflow-y-auto">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-t border-border">
              <div className="p-1 text-xs text-muted-foreground text-right pr-2 border-r border-border">
                {format(new Date().setHours(hour, 0), "HH:mm")}
              </div>
              {days.map((day) => {
                const dayEvents = getEventsForDay(day).filter((e) => {
                  const eventHour = getHours(parseISO(e.scheduled_at));
                  return eventHour === hour;
                });
                return (
                  <div
                    key={day.toString() + hour}
                    className="min-h-[50px] p-0.5 border-r border-border last:border-r-0 relative"
                  >
                    {dayEvents.map((event) => renderEventChip(event))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Day View
  const renderDayView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayEvents = getEventsForDay(currentDate);

    return (
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-muted text-center">
          <div className="text-sm text-muted-foreground">{format(currentDate, "EEEE")}</div>
          <div className={`
            text-3xl font-bold w-12 h-12 mx-auto flex items-center justify-center rounded-full
            ${isSameDay(currentDate, new Date()) ? "bg-primary text-primary-foreground" : ""}
          `}>
            {format(currentDate, "d")}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{format(currentDate, "MMMM yyyy")}</div>
        </div>
        {/* Time grid */}
        <div className="max-h-[600px] overflow-y-auto">
          {hours.map((hour) => {
            const hourEvents = dayEvents.filter((e) => {
              const eventHour = getHours(parseISO(e.scheduled_at));
              return eventHour === hour;
            });
            return (
              <div key={hour} className="grid grid-cols-[80px_1fr] border-t border-border">
                <div className="p-2 text-sm text-muted-foreground text-right pr-3 border-r border-border">
                  {format(new Date().setHours(hour, 0), "HH:mm")}
                </div>
                <div className="min-h-[60px] p-1">
                  {hourEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={() => handleEventClick(event)}
                      className={`
                        cursor-pointer rounded-lg p-2 mb-1 transition-all hover:opacity-80
                        ${event.type === "post" 
                          ? "bg-blue-500/20 border-l-4 border-blue-500" 
                          : "bg-purple-500/20 border-l-4 border-purple-500"
                        }
                      `}
                    >
                      <div className="flex items-center gap-2">
                        {event.type === "post" ? (
                          <FileText className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Image className="h-4 w-4 text-purple-500" />
                        )}
                        <span className="font-medium">{event.title}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(parseISO(event.scheduled_at), "HH:mm")} • {event.status}
                        {event.platforms && event.platforms.length > 0 && (
                          <span> • {event.platforms.join(", ")}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getHeaderTitle = () => {
    if (view === "month") return format(currentDate, "MMMM yyyy");
    if (view === "week") {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
    }
    return format(currentDate, "MMMM d, yyyy");
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold">Calendar</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["month", "week", "day"] as ViewType[]).map((v) => (
                <Button
                  key={v}
                  variant={view === v ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView(v)}
                  className="rounded-none capitalize"
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={navigatePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={navigateNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
          </div>
          <h2 className="text-xl font-semibold">{getHeaderTitle()}</h2>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span>Posts</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-purple-500" />
              <span>Stories</span>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <Card className="p-4">
          {loading ? (
            <div className="flex items-center justify-center h-[500px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <>
              {view === "month" && renderMonthView()}
              {view === "week" && renderWeekView()}
              {view === "day" && renderDayView()}
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
