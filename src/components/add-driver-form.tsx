"use client";

import { useState } from "react";
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
import { useRef } from "react";
import { useAuth } from "@/firebase";
import { Loader2 } from "lucide-react";

export function AddDriverForm() {
  const { toast } = useToast();
  const auth = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const user = auth.currentUser;
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to invite a driver.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;

    if (!email) {
      toast({
        title: "Error",
        description: "Email is required.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const idToken = await user.getIdToken();
      
      const response = await fetch('/api/add-new-driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      toast({
        title: "Success",
        description: result.message || "Invitation sent successfully!",
      });
      
      formRef.current?.reset();
      closeRef.current?.click();

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SheetContent className="sm:max-w-lg">
      <SheetHeader>
        <SheetTitle className="font-headline">Invite New Driver</SheetTitle>
        <SheetDescription>
          Enter the driver's email to send them an invitation to create their profile and join your fleet.
        </SheetDescription>
      </SheetHeader>
      
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 py-6">
        <div className="space-y-2">
          <Label htmlFor="email">Driver's Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="e.g., driver@example.com"
            required
            disabled={isSubmitting}
          />
        </div>

        <SheetFooter className="pt-6">
          <SheetClose asChild>
            <Button ref={closeRef} type="button" variant="secondary" disabled={isSubmitting}>
              Cancel
            </Button>
          </SheetClose>
          <Button type="submit" variant="accent" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Invitation'
            )}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  );
}
