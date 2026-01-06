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
  getHours,
} from "date-fns";
import { ChevronLeft, ChevronRight, FileText, Image, Calendar as CalendarIcon, Sparkles, Star } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getHolidayForDate } from "@/lib/holidays";

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
      const { data: posts, error: postsError } = await supabase
        .from("posts")
        .select("id, title, scheduled_at, status, platforms, type_of_post")
        .eq("user_id", user?.id)
        .not("scheduled_at", "is", null);

      if (postsError) throw postsError;

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
              group cursor-pointer rounded-md px-2 py-1 text-xs mb-1
              transition-all duration-300 ease-out
              hover:scale-[1.02] hover:shadow-lg
              animate-fade-in
              ${isPost 
                ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-600 dark:text-blue-400 border-l-3 border-blue-500 hover:from-blue-500/30 hover:to-cyan-500/30" 
                : "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-600 dark:text-purple-400 border-l-3 border-purple-500 hover:from-purple-500/30 hover:to-pink-500/30"
              }
            `}
          >
            {compact ? (
              <span className="flex items-center gap-1">
                {isPost ? <FileText className="h-3 w-3 animate-pulse" /> : <Image className="h-3 w-3 animate-pulse" />}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                {isPost ? <FileText className="h-3 w-3 flex-shrink-0" /> : <Image className="h-3 w-3 flex-shrink-0" />}
                <span className="font-semibold">{time}</span>
                <span className="truncate opacity-80">{event.title}</span>
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs bg-card/95 backdrop-blur-sm border-border/50 shadow-xl animate-scale-in">
          <div className="space-y-2 p-1">
            <p className="font-bold text-foreground">{event.title}</p>
            <p className="text-xs text-muted-foreground">
              {format(parseISO(event.scheduled_at), "PPp")}
            </p>
            <div className="flex items-center gap-2">
              <Badge 
                variant={event.type === "post" ? "default" : "secondary"}
                className={event.type === "post" 
                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white" 
                  : "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                }
              >
                {event.type === "post" ? "Post" : "Story"}
              </Badge>
              <Badge variant="outline" className="capitalize">{event.status}</Badge>
            </div>
            {event.platforms && event.platforms.length > 0 && (
              <p className="text-xs text-muted-foreground">Platforms: {event.platforms.join(", ")}</p>
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

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const currentDay = day;
        const dayEvents = getEventsForDay(currentDay);
        const isToday = isSameDay(currentDay, new Date());
        const isCurrentMonth = isSameMonth(currentDay, monthStart);
        const holiday = getHolidayForDate(currentDay);

        days.push(
          <div
            key={day.toString()}
            className={`
              min-h-[120px] p-2 border-r border-b border-border/30
              transition-all duration-300 ease-out
              hover:bg-accent/5
              ${!isCurrentMonth ? "bg-muted/20" : "bg-card/50"}
              ${isToday ? "bg-primary/5 ring-2 ring-primary/30 ring-inset" : ""}
              ${holiday ? "bg-amber-500/5" : ""}
              animate-fade-in
            `}
            style={{ animationDelay: `${i * 20}ms` }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`
                text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                transition-all duration-300
                ${isToday 
                  ? "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30 scale-110" 
                  : "hover:bg-accent/20"
                }
                ${!isCurrentMonth ? "text-muted-foreground/50" : "text-foreground"}
              `}>
                {format(currentDay, "d")}
              </div>
              {holiday && (
                <Tooltip>
                  <TooltipTrigger>
                    <Star className={`h-3.5 w-3.5 ${holiday.type === 'federal' ? 'text-amber-500 fill-amber-500' : 'text-amber-400'}`} />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-card/95 backdrop-blur-sm">
                    <p className="font-medium">{holiday.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{holiday.type} holiday</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {holiday && (
              <div className={`text-xs px-1.5 py-0.5 rounded mb-1 truncate ${
                holiday.type === 'federal' 
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 font-medium' 
                  : 'bg-amber-400/10 text-amber-600 dark:text-amber-500'
              }`}>
                {holiday.name}
              </div>
            )}
            <div className="space-y-1 overflow-hidden max-h-[60px]">
              {dayEvents.slice(0, 2).map((event, idx) => (
                <div key={event.id} style={{ animationDelay: `${idx * 50}ms` }}>
                  {renderEventChip(event)}
                </div>
              ))}
              {dayEvents.length > 2 && (
                <div className="text-xs text-muted-foreground px-2 py-0.5 bg-muted/50 rounded-md inline-block animate-fade-in">
                  +{dayEvents.length - 2} more
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
      <div className="rounded-xl border border-border/50 overflow-hidden shadow-xl bg-gradient-to-br from-card to-card/80 backdrop-blur-sm">
        <div className="grid grid-cols-7 bg-gradient-to-r from-muted/80 to-muted/60 backdrop-blur-sm">
          {dayNames.map((name, idx) => (
            <div 
              key={name} 
              className="p-3 text-center text-sm font-semibold text-muted-foreground border-r border-border/30 last:border-r-0 animate-fade-in"
              style={{ animationDelay: `${idx * 30}ms` }}
            >
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
      <div className="rounded-xl border border-border/50 overflow-hidden shadow-xl bg-gradient-to-br from-card to-card/80">
        {/* Header */}
        <div className="grid grid-cols-[70px_repeat(7,1fr)] bg-gradient-to-r from-muted/80 to-muted/60 backdrop-blur-sm">
          <div className="p-3 border-r border-border/30" />
          {days.map((day, idx) => {
            const holiday = getHolidayForDate(day);
            return (
              <div
                key={day.toString()}
                className={`
                  p-3 text-center border-r border-border/30 last:border-r-0
                  transition-all duration-300 animate-fade-in
                  ${isSameDay(day, new Date()) ? "bg-primary/10" : ""}
                  ${holiday ? "bg-amber-500/5" : ""}
                `}
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{format(day, "EEE")}</div>
                <div className={`
                  text-xl font-bold w-10 h-10 mx-auto flex items-center justify-center rounded-full mt-1
                  transition-all duration-300
                  ${isSameDay(day, new Date()) 
                    ? "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30" 
                    : "hover:bg-accent/20"
                  }
                `}>
                  {format(day, "d")}
                </div>
                {holiday && (
                  <div className={`text-xs mt-1 truncate ${
                    holiday.type === 'federal' ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-amber-500'
                  }`}>
                    {holiday.name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Time grid */}
        <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-[70px_repeat(7,1fr)] border-t border-border/20 hover:bg-accent/5 transition-colors duration-200">
              <div className="p-2 text-xs text-muted-foreground text-right pr-3 border-r border-border/30 font-medium">
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
                    className="min-h-[60px] p-1 border-r border-border/20 last:border-r-0 relative hover:bg-accent/5 transition-colors duration-200"
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
    const holiday = getHolidayForDate(currentDate);

    return (
      <div className="rounded-xl border border-border/50 overflow-hidden shadow-xl bg-gradient-to-br from-card to-card/80">
        {/* Header */}
        <div className={`p-6 text-center backdrop-blur-sm animate-fade-in ${
          holiday ? 'bg-gradient-to-r from-amber-500/10 via-amber-400/10 to-amber-500/10' : 'bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10'
        }`}>
          <div className="text-sm text-muted-foreground font-medium uppercase tracking-widest">{format(currentDate, "EEEE")}</div>
          <div className={`
            text-4xl font-bold w-16 h-16 mx-auto flex items-center justify-center rounded-full mt-2
            transition-all duration-500 animate-scale-in
            ${isSameDay(currentDate, new Date()) 
              ? "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-xl shadow-primary/40" 
              : "bg-muted/50 text-foreground"
            }
          `}>
            {format(currentDate, "d")}
          </div>
          <div className="text-sm text-muted-foreground mt-2 font-medium">{format(currentDate, "MMMM yyyy")}</div>
          {holiday && (
            <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${
              holiday.type === 'federal' 
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400' 
                : 'bg-amber-400/15 text-amber-600 dark:text-amber-500'
            }`}>
              <Star className={`h-4 w-4 ${holiday.type === 'federal' ? 'fill-current' : ''}`} />
              <span className="font-medium">{holiday.name}</span>
            </div>
          )}
        </div>
        {/* Time grid */}
        <div className="max-h-[500px] overflow-y-auto scrollbar-thin">
          {hours.map((hour, idx) => {
            const hourEvents = dayEvents.filter((e) => {
              const eventHour = getHours(parseISO(e.scheduled_at));
              return eventHour === hour;
            });
            return (
              <div 
                key={hour} 
                className="grid grid-cols-[100px_1fr] border-t border-border/20 hover:bg-accent/5 transition-colors duration-200 animate-fade-in"
                style={{ animationDelay: `${idx * 15}ms` }}
              >
                <div className="p-3 text-sm text-muted-foreground text-right pr-4 border-r border-border/30 font-medium">
                  {format(new Date().setHours(hour, 0), "HH:mm")}
                </div>
                <div className="min-h-[70px] p-2">
                  {hourEvents.map((event, eventIdx) => (
                    <div
                      key={event.id}
                      onClick={() => handleEventClick(event)}
                      className={`
                        cursor-pointer rounded-xl p-3 mb-2 
                        transition-all duration-300 ease-out
                        hover:scale-[1.01] hover:shadow-xl
                        animate-fade-in
                        ${event.type === "post" 
                          ? "bg-gradient-to-r from-blue-500/15 to-cyan-500/15 border-l-4 border-blue-500 hover:from-blue-500/25 hover:to-cyan-500/25" 
                          : "bg-gradient-to-r from-purple-500/15 to-pink-500/15 border-l-4 border-purple-500 hover:from-purple-500/25 hover:to-pink-500/25"
                        }
                      `}
                      style={{ animationDelay: `${eventIdx * 50}ms` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`
                          p-2 rounded-lg
                          ${event.type === "post" 
                            ? "bg-gradient-to-br from-blue-500 to-cyan-500" 
                            : "bg-gradient-to-br from-purple-500 to-pink-500"
                          }
                        `}>
                          {event.type === "post" ? (
                            <FileText className="h-4 w-4 text-white" />
                          ) : (
                            <Image className="h-4 w-4 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-foreground block truncate">{event.title}</span>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                            <span>{format(parseISO(event.scheduled_at), "HH:mm")}</span>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                            <span className="capitalize">{event.status}</span>
                            {event.platforms && event.platforms.length > 0 && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                <span>{event.platforms.join(", ")}</span>
                              </>
                            )}
                          </div>
                        </div>
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
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/25">
              <CalendarIcon className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
              <p className="text-sm text-muted-foreground">Schedule and manage your content</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-xl border border-border/50 overflow-hidden bg-muted/30 backdrop-blur-sm p-1 shadow-inner">
              {(["month", "week", "day"] as ViewType[]).map((v) => (
                <Button
                  key={v}
                  variant={view === v ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView(v)}
                  className={`
                    rounded-lg capitalize font-medium transition-all duration-300
                    ${view === v 
                      ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md" 
                      : "hover:bg-accent/20"
                    }
                  `}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between bg-gradient-to-r from-muted/50 via-transparent to-muted/50 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={navigatePrev}
              className="rounded-xl hover:bg-accent/20 hover:scale-105 transition-all duration-300 border-border/50"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={navigateNext}
              className="rounded-xl hover:bg-accent/20 hover:scale-105 transition-all duration-300 border-border/50"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={goToToday}
              className="rounded-xl hover:bg-accent/20 hover:scale-105 transition-all duration-300 border-border/50 font-medium"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Today
            </Button>
          </div>
          <h2 className="text-xl font-bold text-foreground animate-fade-in">{getHeaderTitle()}</h2>
          <div className="flex items-center gap-5 text-sm">
            <div className="flex items-center gap-2 animate-fade-in">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 shadow-sm shadow-blue-500/50" />
              <span className="font-medium text-muted-foreground">Posts</span>
            </div>
            <div className="flex items-center gap-2 animate-fade-in" style={{ animationDelay: '50ms' }}>
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shadow-sm shadow-purple-500/50" />
              <span className="font-medium text-muted-foreground">Stories</span>
            </div>
            <div className="flex items-center gap-2 animate-fade-in" style={{ animationDelay: '100ms' }}>
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="font-medium text-muted-foreground">Holidays</span>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="animate-fade-in" style={{ animationDelay: '100ms' }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[500px] rounded-xl border border-border/50 bg-gradient-to-br from-card to-card/80">
              <div className="relative">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/30 border-t-primary" />
                <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-primary" />
              </div>
              <p className="text-muted-foreground mt-4 animate-pulse">Loading your schedule...</p>
            </div>
          ) : (
            <>
              {view === "month" && renderMonthView()}
              {view === "week" && renderWeekView()}
              {view === "day" && renderDayView()}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
