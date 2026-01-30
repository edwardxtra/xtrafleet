"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useRef } from "react";
import { useAuth } from "@/firebase";
import { Loader2, HelpCircle } from "lucide-react";

export function AddDriverForm() {
  const { toast } = useToast();
  const auth = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [driverType, setDriverType] = useState<"existing" | "newHire">("existing");
  const [hasConfirmedDQF, setHasConfirmedDQF] = useState(false);

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

    // Validate DQF confirmation for existing drivers
    if (driverType === "existing" && !hasConfirmedDQF) {
      toast({
        title: "Confirmation Required",
        description: "Please confirm that this driver has a complete DQF on file.",
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
        body: JSON.stringify({ 
          email,
          driverType,
          hasConfirmedDQF: driverType === "existing" ? hasConfirmedDQF : undefined,
        }),
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
      setDriverType("existing");
      setHasConfirmedDQF(false);
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
    <SheetContent className="sm:max-w-lg overflow-y-auto">
      <SheetHeader>
        <SheetTitle className="font-headline">Add Driver to Your Fleet</SheetTitle>
        <SheetDescription>
          Select the type of driver you're adding and provide their email address.
        </SheetDescription>
      </SheetHeader>
      
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6 py-6">
        {/* Driver Type Selection */}
        <div className="space-y-4">
          <Label className="text-base font-medium">What type of driver are you adding?</Label>
          
          <RadioGroup 
            value={driverType} 
            onValueChange={(value) => {
              setDriverType(value as "existing" | "newHire");
              setHasConfirmedDQF(false); // Reset checkbox when switching types
            }}
            className="space-y-3"
          >
            {/* Existing Driver Option */}
            <div className="flex items-start space-x-3 p-4 rounded-lg border-2 border-border hover:border-primary/50 transition-colors">
              <RadioGroupItem value="existing" id="existing" className="mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="existing" className="font-medium cursor-pointer">
                    Existing Driver
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          A driver who has worked for you long-term and already has all required documentation (Driver Qualification File) on file.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Has complete Driver Qualification File (DQF)
                </p>
              </div>
            </div>

            {/* New Hire Option */}
            <div className="flex items-start space-x-3 p-4 rounded-lg border-2 border-border hover:border-primary/50 transition-colors">
              <RadioGroupItem value="newHire" id="newHire" className="mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="newHire" className="font-medium cursor-pointer">
                    New Hire
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Someone you just hired who doesn't have all proper documentation yet. They will complete their Driver Qualification File (DQF) after registration.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Needs to complete DQF after registration
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* DQF Confirmation Checkbox (Only for Existing Drivers) */}
        {driverType === "existing" && (
          <div className="p-4 bg-muted/50 rounded-lg space-y-3 border border-border">
            <div className="flex items-start space-x-3">
              <Checkbox 
                id="dqf-confirm" 
                checked={hasConfirmedDQF}
                onCheckedChange={(checked) => setHasConfirmedDQF(checked as boolean)}
              />
              <div className="flex-1">
                <label 
                  htmlFor="dqf-confirm"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  I confirm this driver has a complete Driver Qualification File (DQF) on file
                </label>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Required: This driver must have all FMCSA-required documentation including CDL, medical certificate, employment history, and accident history.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Email Input */}
        <div className="space-y-2">
          <Label htmlFor="email">Driver's Email Address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="e.g., driver@example.com"
            required
            disabled={isSubmitting}
          />
          {driverType === "newHire" && (
            <p className="text-xs text-muted-foreground">
              This driver will receive an invitation to complete their registration and DQF.
            </p>
          )}
        </div>

        <SheetFooter className="pt-6">
          <SheetClose asChild>
            <Button ref={closeRef} type="button" variant="secondary" disabled={isSubmitting}>
              Cancel
            </Button>
          </SheetClose>
          <Button 
            type="submit" 
            variant="accent" 
            disabled={isSubmitting || (driverType === "existing" && !hasConfirmedDQF)}
          >
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
