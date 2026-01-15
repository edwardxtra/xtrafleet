
"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { useRouter } from "next/navigation";
import { useAuth } from "@/firebase";
import { TRAILER_TYPES } from "@/lib/trailer-types";

export function AddLoadForm() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const [isPending, startTransition] = useTransition();
  const [pickupDateTime, setPickupDateTime] = useState<Date | undefined>();
  const [requiredTrailerType, setRequiredTrailerType] = useState<string>("dry-van");
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

    if (!pickupDateTime) {
        toast({
            title: "Pickup date & time is required.",
            description: "Please select a date and time for the load pickup.",
            variant: "destructive"
        });
        return;
    }

    const data = {
        origin: formData.get('origin'),
        destination: formData.get('destination'),
        price: Number(formData.get('price')),
        pickupDate: pickupDateTime.toISOString(),
        cargo: formData.get('cargoType'),
        weight: Number(formData.get('weight')),
        requiredTrailerType: requiredTrailerType,
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
        setPickupDateTime(undefined);
        setRequiredTrailerType("dry-van");
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

  // Set minimum date to today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
        <div className="space-y-2">
          <Label>Required Trailer Type</Label>
          <Select value={requiredTrailerType} onValueChange={setRequiredTrailerType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRAILER_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Pickup Date & Time</Label>
          <DateTimePicker
            date={pickupDateTime}
            onDateChange={setPickupDateTime}
            placeholder="Select pickup date & time"
            minDate={today}
            showTime={true}
          />
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
