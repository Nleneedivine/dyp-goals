import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO } from "date-fns";
import { CalendarIcon, TrendingUp, Clock, CheckCircle, Book } from "lucide-react";
import { cn } from "@/lib/utils";

interface ArchivedTodo {
  id: string;
  activity: string;
  time: string;
  completed: boolean;
  category?: string;
}

interface ArchivedDay {
  date: string;
  items: ArchivedTodo[];
}

interface BookItem {
  id: string;
  title: string;
  month: string; // YYYY-MM format
  completed: boolean;
  addedAt: string;
}

interface TodoArchiveProps {
  archives: ArchivedDay[];
  books: BookItem[];
  onSelectDate: (date: Date) => void;
  onUpdateBook: (bookId: string, completed: boolean) => void;
  onAddBook: (title: string, month: string) => void;
}

export function TodoArchive({ archives, books, onSelectDate, onUpdateBook, onAddBook }: TodoArchiveProps) {
  const [selectedArchiveDate, setSelectedArchiveDate] = useState<Date | undefined>(undefined);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [selectedBookMonth, setSelectedBookMonth] = useState(format(new Date(), "yyyy-MM"));

  // Calculate frequent tasks
  const frequentTasks = useMemo(() => {
    const taskCount: Record<string, number> = {};
    archives.forEach((day) => {
      day.items.forEach((item) => {
        const key = item.activity.toLowerCase();
        taskCount[key] = (taskCount[key] || 0) + 1;
      });
    });
    return Object.entries(taskCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [archives]);

  // Get archive for selected date
  const selectedArchive = useMemo(() => {
    if (!selectedArchiveDate) return null;
    const dateStr = format(selectedArchiveDate, "yyyy-MM-dd");
    return archives.find((a) => a.date === dateStr);
  }, [archives, selectedArchiveDate]);

  // Group books by month
  const booksByMonth = useMemo(() => {
    const grouped: Record<string, BookItem[]> = {};
    books.forEach((book) => {
      if (!grouped[book.month]) {
        grouped[book.month] = [];
      }
      grouped[book.month].push(book);
    });
    return grouped;
  }, [books]);

  // Get sorted months
  const sortedMonths = useMemo(() => {
    return Object.keys(booksByMonth).sort((a, b) => b.localeCompare(a));
  }, [booksByMonth]);

  const handleAddBook = () => {
    if (!newBookTitle.trim()) return;
    onAddBook(newBookTitle.trim(), selectedBookMonth);
    setNewBookTitle("");
  };

  // Get dates that have archives
  const archivedDates = useMemo(() => {
    return archives.map((a) => parseISO(a.date));
  }, [archives]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="archives" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="archives">Archives</TabsTrigger>
          <TabsTrigger value="frequent">Frequent Tasks</TabsTrigger>
          <TabsTrigger value="books">Books by Month</TabsTrigger>
        </TabsList>

        <TabsContent value="archives" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Select Date to View
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedArchiveDate}
                  onSelect={(date) => {
                    setSelectedArchiveDate(date);
                    if (date) onSelectDate(date);
                  }}
                  modifiers={{
                    hasArchive: archivedDates,
                  }}
                  modifiersStyles={{
                    hasArchive: {
                      backgroundColor: "hsl(var(--primary) / 0.2)",
                      borderRadius: "0.25rem",
                    },
                  }}
                  className="rounded-md border pointer-events-auto"
                />
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {selectedArchiveDate
                    ? `Tasks for ${format(selectedArchiveDate, "MMMM d, yyyy")}`
                    : "Select a date"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedArchive ? (
                  <ScrollArea className="h-[280px]">
                    <div className="space-y-2">
                      {selectedArchive.items.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-lg border bg-background",
                            item.completed && "opacity-60"
                          )}
                        >
                          {item.completed ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                          )}
                          <span className={cn("flex-1 text-sm", item.completed && "line-through")}>
                            {item.activity}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {item.time}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    {selectedArchiveDate ? "No tasks archived for this date" : "Select a date to view archived tasks"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="frequent" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Top 10 Frequent Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {frequentTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No task history yet. Complete some tasks to see your frequent activities!
                </div>
              ) : (
                <div className="space-y-2">
                  {frequentTasks.map(([task, count], idx) => (
                    <div
                      key={task}
                      className="flex items-center gap-3 p-2 rounded-lg border bg-background"
                    >
                      <Badge variant="secondary" className="w-6 h-6 rounded-full flex items-center justify-center p-0">
                        {idx + 1}
                      </Badge>
                      <span className="flex-1 text-sm capitalize">{task}</span>
                      <Badge variant="outline">{count} times</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="books" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Book className="h-4 w-4" />
                Books to Read by Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Add new book */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Book title..."
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddBook()}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1">
                      <CalendarIcon className="h-4 w-4" />
                      {format(parseISO(selectedBookMonth + "-01"), "MMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="end">
                    <div className="grid grid-cols-4 gap-1">
                      {Array.from({ length: 12 }, (_, i) => {
                        const date = new Date(new Date().getFullYear(), i, 1);
                        const monthStr = format(date, "yyyy-MM");
                        return (
                          <Button
                            key={i}
                            variant={selectedBookMonth === monthStr ? "default" : "ghost"}
                            size="sm"
                            className="text-xs"
                            onClick={() => setSelectedBookMonth(monthStr)}
                          >
                            {format(date, "MMM")}
                          </Button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button size="sm" className="h-9" onClick={handleAddBook} disabled={!newBookTitle.trim()}>
                  Add
                </Button>
              </div>

              {/* Books list by month */}
              <ScrollArea className="h-[300px]">
                {sortedMonths.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No books added yet. Add books to track your reading goals!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sortedMonths.map((month) => (
                      <div key={month}>
                        <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                          {format(parseISO(month + "-01"), "MMMM yyyy")}
                        </h4>
                        <div className="space-y-1">
                          {booksByMonth[month].map((book) => (
                            <div
                              key={book.id}
                              className={cn(
                                "flex items-center gap-2 p-2 rounded-lg border bg-background",
                                book.completed && "opacity-60"
                              )}
                            >
                              <button
                                onClick={() => onUpdateBook(book.id, !book.completed)}
                                className="focus:outline-none"
                              >
                                {book.completed ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                                )}
                              </button>
                              <span className={cn("flex-1 text-sm", book.completed && "line-through")}>
                                {book.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
