"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";
import { passwordSchema, passwordRequirements } from "@/lib/password-validation";
import { TRAILER_TYPES } from "@/lib/trailer-types";

// Get all trailer type values for the schema
const trailerTypeValues = TRAILER_TYPES.map(t => t.value) as [string, ...string[]];

// Simplified schema with enhanced password validation
const quickProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  location: z.string().min(1, "Your current city/state is required"),
  vehicleType: z.enum(trailerTypeValues),
  password: passwordSchema, // Enhanced password validation
  userAgreement: z.boolean().refine(val => val === true, "You must accept the User Agreement"),
  esignConsent: z.boolean().refine(val => val === true, "You must accept the E-Sign Agreement"),
});

type QuickProfileValues = z.infer<typeof quickProfileSchema>;

interface DriverRegisterFormProps {
  driverId: string;
  ownerId: string;
  invitationEmail: string;
  driverType?: 'existing' | 'newHire';
}

export function DriverRegisterForm({ driverId, ownerId, invitationEmail, driverType }: DriverRegisterFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<QuickProfileValues>({
    resolver: zodResolver(quickProfileSchema),
    mode: "onChange",
    defaultValues: {
      userAgreement: false,
      esignConsent: false,
    }
  });

  const passwordValue = form.watch("password") || "";

  const onSubmit = async (values: QuickProfileValues) => {
    setIsSubmitting(true);

    try {
      const { password, firstName, lastName, userAgreement, esignConsent, ...profileData } = values;

      // Create account
      const response = await fetch('/api/create-driver-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: invitationEmail,
          password: password,
          token: driverId,
          ownerId: ownerId,
          driverType: driverType,
          profileData: {
            ...profileData,
            name: `${firstName} ${lastName}`,
            firstName,
            lastName,
            profileComplete: false,
            profileCompletionStep: 'basic_info_complete',
          },
          consents: {
            userAgreement: {
              accepted: true,
              acceptedAt: new Date().toISOString(),
              version: "2025-10-17",
            },
            esignAgreement: {
              accepted: true,
              acceptedAt: new Date().toISOString(),
              version: "2025-01-29",
            },
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create account');
      }

      toast({
        title: "Welcome to XtraFleet! 🎉",
        description: "Your account has been created. Redirecting to login...",
      });

      // Redirect to login page with email pre-filled
      router.push(`/login?email=${encodeURIComponent(invitationEmail)}&message=Account created successfully. Please log in.`);

    } catch (error: any) {
      console.error('Failed to create driver profile:', error);
      toast({
        title: "Registration Failed",
        description: error?.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check which password requirements are met
  const passwordChecks = {
    length: passwordValue.length >= 8,
    uppercase: /[A-Z]/.test(passwordValue),
    lowercase: /[a-z]/.test(passwordValue),
    number: /[0-9]/.test(passwordValue),
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">✨ Quick Setup</p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            Create your account in under 2 minutes. You'll complete your compliance documents after logging in.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Create Your Account</h3>
          
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
                
                {/* Password Requirements Checklist */}
                {passwordValue && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-muted-foreground mb-1">Password must have:</p>
                    {[
                      { label: "At least 8 characters", met: passwordChecks.length },
                      { label: "One uppercase letter", met: passwordChecks.uppercase },
                      { label: "One lowercase letter", met: passwordChecks.lowercase },
                      { label: "One number", met: passwordChecks.number },
                    ].map((req, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        {req.met ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <X className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className={req.met ? "text-green-600" : "text-muted-foreground"}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., John" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., (123) 456-7890" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Location</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Columbus, OH" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="vehicleType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Vehicle Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your main vehicle type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TRAILER_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Legal Consents */}
        <div className="space-y-4 pt-4 border-t">
          <p className="text-sm font-medium">Legal Agreements</p>
          
          {/* User Agreement Consent */}
          <FormField
            control={form.control}
            name="userAgreement"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start gap-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-1"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <Label className="text-sm leading-relaxed cursor-pointer">
                      I understand that XtraFleet is a technology platform only and that I remain 
                      solely responsible for regulatory compliance, insurance adequacy, and trip safety.{' '}
                      <Link href="/legal/user-agreement" target="_blank" className="underline text-primary hover:text-primary/80">
                        View User Agreement
                      </Link>
                    </Label>
                    <FormMessage />
                  </div>
                </div>
              </FormItem>
            )}
          />

          {/* E-Sign Consent - Driver Version */}
          <FormField
            control={form.control}
            name="esignConsent"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start gap-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-1"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <Label className="text-sm leading-relaxed cursor-pointer">
                      You consent to receive Electronic Records related to driver qualification, 
                      safety compliance, background screening, and employment eligibility.{' '}
                      <Link href="/legal/esign-consent" target="_blank" className="underline text-primary hover:text-primary/80">
                        View E-Sign Agreement
                      </Link>
                    </Label>
                    <FormMessage />
                  </div>
                </div>
              </FormItem>
            )}
          />
        </div>

        <div className="bg-muted rounded-lg p-4">
          <p className="text-sm text-muted-foreground">
            📋 <strong>After signup:</strong> Complete your CDL info and compliance documents to start receiving loads.
          </p>
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting} size="lg" className="w-full md:w-auto">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Account...
              </>
            ) : (
              "Create Account & Continue →"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
