"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useRef, useEffect } from "react";
import { useFormState } from "react-dom";
import { inviteDriver } from "@/lib/actions";

const initialState = {
  message: '',
  error: '',
};

export function AddDriverForm() {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  
  const [state, formAction] = useFormState(inviteDriver, initialState);

  useEffect(() => {
    if (state.message) {
      toast({
        title: "Success",
        description: state.message,
      });
      formRef.current?.reset();
      closeRef.current?.click();
    }

    if (state.error) {
      toast({
        title: "Error",
        description: state.error,
        variant: "destructive",
      });
    }
  }, [state, toast]);

  return (
    <SheetContent className="sm:max-w-lg">
      <SheetHeader>
        <SheetTitle className="font-headline">Invite New Driver</SheetTitle>
        <SheetDescription>
          Enter the driver's email to send them an invitation to create their profile and join your fleet.
        </SheetDescription>
      </SheetHeader>
      
      <form ref={formRef} action={formAction} className="space-y-4 py-6">
        <div className="space-y-2">
          <Label htmlFor="email">Driver's Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="e.g., driver@example.com"
            required
          />
        </div>

        <SheetFooter className="pt-6">
          <SheetClose asChild>
            <Button ref={closeRef} type="button" variant="secondary">
              Cancel
            </Button>
          </SheetClose>
          <Button type="submit" variant="accent">
            Send Invitation
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  );
}
