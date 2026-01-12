"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DateTimePickerProps {
  date?: Date
  onDateChange: (date: Date | undefined) => void
  placeholder?: string
  minDate?: Date
  showTime?: boolean
  disabled?: boolean
}

export function DateTimePicker({
  date,
  onDateChange,
  placeholder = "Pick date & time",
  minDate,
  showTime = true,
  disabled = false,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  // Generate time options (every 30 minutes)
  const timeOptions = React.useMemo(() => {
    const options: { value: string; label: string }[] = []
    for (let hour = 0; hour < 24; hour++) {
      for (let minute of [0, 30]) {
        const h = hour.toString().padStart(2, "0")
        const m = minute.toString().padStart(2, "0")
        const period = hour < 12 ? "AM" : "PM"
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
        options.push({
          value: `${h}:${m}`,
          label: `${displayHour}:${m.padStart(2, "0")} ${period}`,
        })
      }
    }
    return options
  }, [])

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      // Preserve existing time if date already has one
      if (date) {
        selectedDate.setHours(date.getHours())
        selectedDate.setMinutes(date.getMinutes())
      } else {
        // Default to 9:00 AM for new dates
        selectedDate.setHours(9)
        selectedDate.setMinutes(0)
      }
      onDateChange(selectedDate)
    } else {
      onDateChange(undefined)
    }
  }

  const handleTimeChange = (timeString: string) => {
    const [hours, minutes] = timeString.split(":").map(Number)
    const newDate = date ? new Date(date) : new Date()
    newDate.setHours(hours)
    newDate.setMinutes(minutes)
    newDate.setSeconds(0)
    onDateChange(newDate)
  }

  const currentTimeValue = date
    ? `${date.getHours().toString().padStart(2, "0")}:${(Math.floor(date.getMinutes() / 30) * 30).toString().padStart(2, "0")}`
    : undefined

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? (
            showTime ? format(date, "PPP 'at' p") : format(date, "PPP")
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleDateSelect}
          disabled={(date) => minDate ? date < minDate : false}
          initialFocus
        />
        {showTime && (
          <div className="border-t p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Select value={currentTimeValue} onValueChange={handleTimeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {timeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <div className="border-t p-3 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onDateChange(undefined)
              setIsOpen(false)
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={() => setIsOpen(false)}
            disabled={!date}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
