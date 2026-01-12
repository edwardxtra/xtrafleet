"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useAuth, useFirestore } from "@/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { showSuccess, showError } from "@/lib/toast-utils";
import type { Load } from "@/lib/data";

interface EditLoadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: Load | null;
  onSuccess?: () => void;
}

export function EditLoadModal({ open, onOpenChange, load, onSuccess }: EditLoadModalProps) {
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);
  const [date, setDate] = useState<Date | undefined>();
  const [formData, setFormData] = useState({
    origin: "",
    destination: "",
    price: "",
    cargo: "",
    weight: "",
    description: "",
    time: "09:00",
  });

  useEffect(() => {
    if (load) {
      setFormData({
        origin: load.origin || "",
        destination: load.destination || "",
        price: load.price?.toString() || "",
        cargo: load.cargo || "",
        weight: load.weight?.toString() || "",
        description: load.description || "",
        time: load.pickupDate ? format(parseISO(load.pickupDate), "HH:mm") : "09:00",
      });
      if (load.pickupDate) {
        setDate(parseISO(load.pickupDate));
      }
    }
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!load || !firestore || !auth.currentUser) return;

    setIsLoading(true);
    try {
      const loadRef = doc(firestore, `owner_operators/${auth.currentUser.uid}/loads/${load.id}`);
      
      await updateDoc(loadRef, {
        origin: formData.origin,
        destination: formData.destination,
        price: Number(formData.price),
        cargo: formData.cargo,
        weight: Number(formData.weight),
        description: formData.description,
        pickupDate: date ? `${format(date, "yyyy-MM-dd")}T${formData.time}` : null,
      });

      showSuccess("Load updated successfully");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      showError(error.message || "Failed to update load");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-headline">Edit Load</DialogTitle>
          <DialogDescription>
            Update the load details below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-origin">Origin</Label>
              <Input
                id="edit-origin"
                value={formData.origin}
                onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                placeholder="e.g., New York, NY"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-destination">Destination</Label>
              <Input
                id="edit-destination"
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                placeholder="e.g., Los Angeles, CA"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-price">Price ($)</Label>
              <Input
                id="edit-price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="e.g., 2500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cargo">Type of Load</Label>
              <Input
                id="edit-cargo"
                value={formData.cargo}
                onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                placeholder="e.g., Electronics"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-weight">Weight (lbs)</Label>
            <Input
              id="edit-weight"
              type="number"
              value={formData.weight}
              onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
              placeholder="e.g., 40000"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col space-y-2">
              <Label>Pickup Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
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
              <Label htmlFor="edit-time">Time</Label>
              <Input
                id="edit-time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Additional Details</Label>
            <Textarea
              id="edit-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Team drivers required, no-touch freight"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
