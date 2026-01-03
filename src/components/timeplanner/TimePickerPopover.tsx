import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimePickerPopoverProps {
  value: string;
  onChange: (time: string) => void;
  className?: string;
}

const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const minutes = ["00", "15", "30", "45"];

export function TimePickerPopover({ value, onChange, className }: TimePickerPopoverProps) {
  const [open, setOpen] = useState(false);
  
  // Parse current value (e.g., "09:00" or "Custom")
  const [currentHour, currentMinute] = value !== "Custom" && value.includes(":") 
    ? value.split(":") 
    : ["09", "00"];

  const handleTimeSelect = (hour: string, minute: string) => {
    onChange(`${hour}:${minute}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-7 gap-1.5 text-xs font-normal", className)}
        >
          <Clock className="h-3 w-3" />
          {value === "Custom" ? "Set time" : value}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <div className="flex gap-2">
          {/* Hours */}
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground mb-1 text-center">Hour</span>
            <ScrollArea className="h-48 w-14">
              <div className="flex flex-col gap-1">
                {hours.map((hour) => (
                  <Button
                    key={hour}
                    variant={hour === currentHour ? "default" : "ghost"}
                    size="sm"
                    className="h-8 w-full text-xs"
                    onClick={() => handleTimeSelect(hour, currentMinute)}
                  >
                    {hour}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
          {/* Minutes */}
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground mb-1 text-center">Min</span>
            <ScrollArea className="h-48 w-14">
              <div className="flex flex-col gap-1">
                {minutes.map((minute) => (
                  <Button
                    key={minute}
                    variant={minute === currentMinute ? "default" : "ghost"}
                    size="sm"
                    className="h-8 w-full text-xs"
                    onClick={() => handleTimeSelect(currentHour, minute)}
                  >
                    {minute}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
