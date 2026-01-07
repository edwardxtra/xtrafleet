
"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useAuth } from "@/firebase";

export function AddLoadForm() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState<Date | undefined>();
  const formRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const user = auth.currentUser;

    if (!user) {
       toast({
        title: "Authentication Error",
        description: "You must be logged in to add a load.",
        variant: "destructive",
      });
      return;
    }

    if (!date) {
        toast({
            title: "Pickup date is required.",
            description: "Please select a date for the load pickup.",
            variant: "destructive"
        });
        return;
    }

    const data = {
        origin: formData.get('origin'),
        destination: formData.get('destination'),
        price: Number(formData.get('price')),
        pickupDate: `${format(date, "yyyy-MM-dd")}T${formData.get('time')}`,
        cargo: formData.get('cargoType'),
        weight: Number(formData.get('weight')),
        additionalDetails: formData.get('additionalDetails'),
    };

    startTransition(async () => {
       try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/loads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to add load');
        }

        toast({
          title: "Load Created",
          description: `Successfully added new load from ${data.origin}.`,
        });
        formRef.current?.reset();
        setDate(undefined);
        closeRef.current?.click();
        router.refresh();

      } catch (error: any) {
        toast({
          title: "Error creating load",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  };

  return (
    <SheetContent className="sm:max-w-lg">
      <SheetHeader>
        <SheetTitle className="font-headline">Add New Load</SheetTitle>
        <SheetDescription>
          Fill in the details of the load. Click save when you're done.
        </SheetDescription>
      </SheetHeader>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 py-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="origin">Origin</Label>
            <Input id="origin" name="origin" placeholder="e.g., New York, NY" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="destination">Destination</Label>
            <Input id="destination" name="destination" placeholder="e.g., Los Angeles, CA" required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
           <div className="space-y-2">
              <Label htmlFor="price">Price ($)</Label>
              <Input id="price" name="price" type="number" placeholder="e.g., 2500" required />
          </div>
           <div className="space-y-2">
              <Label htmlFor="cargoType">Type of Load</Label>
              <Input id="cargoType" name="cargoType" placeholder="e.g., Electronics" required />
          </div>
        </div>
        <div className="space-y-2">
            <Label htmlFor="weight">Weight (lbs)</Label>
            <Input id="weight" name="weight" type="number" placeholder="e.g., 40000" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
           <div className="flex flex-col space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input id="time" name="time" type="time" required />
            </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="additionalDetails">Additional Details</Label>
          <Textarea id="additionalDetails" name="additionalDetails" placeholder="e.g., Team drivers required, no-touch freight" />
        </div>

        <SheetFooter className="pt-4">
          <SheetClose asChild>
            <Button ref={closeRef} type="button" variant="secondary">
              Cancel
            </Button>
          </SheetClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save Load"}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  );
}
