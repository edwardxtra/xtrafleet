"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createCompanyProfile } from "@/lib/actions";
import { useTransition } from "react";
import { useToast } from "@/hooks/use-toast";

const profileFormSchema = z.object({
  legalName: z.string().min(1, "Legal name is required"),
  dba: z.string().optional(),
  phone: z.string().optional(),
  dotNumber: z.string().min(1, "DOT number is required"),
  mcNumber: z.string().min(1, "MC number is required"),
  ein: z.string()
    .min(1, "EIN is required")
    .regex(/^\d{2}-?\d{7}$/, "EIN must be 9 digits (e.g., 12-3456789 or 123456789)")
    .transform(val => {
      // Auto-format: if user enters 123456789, convert to 12-3456789
      if (val.length === 9 && !val.includes('-')) {
        return `${val.slice(0, 2)}-${val.slice(2)}`;
      }
      return val;
    }),
  hqAddress: z.string().min(1, "HQ address is required"),
  loadLocation: z.string().min(1, "Primary load location is required"),
  serviceRegions: z.string().min(1, "Service regions are required"),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function CompanyProfileForm() {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: "onChange",
    defaultValues: {
      legalName: "",
      dba: "",
      phone: "",
      dotNumber: "",
      mcNumber: "",
      ein: "",
      hqAddress: "",
      loadLocation: "",
      serviceRegions: "",
    },
  });

  const { formState } = form;

  const onSubmit = (values: ProfileFormValues) => {
    console.log('🔵 Form onSubmit called with values:', values);
    
    startTransition(async () => {
      const formData = new FormData();
      Object.entries(values).forEach(([key, value]) => {
        formData.append(key, value || '');
      });
      
      console.log('🔵 FormData being sent to server:');
      for (let [key, value] of formData.entries()) {
        console.log(`  ${key}: ${value}`);
      }
      
      try {
        console.log('🔵 Calling createCompanyProfile...');
        await createCompanyProfile(formData);
        console.log('🔵 createCompanyProfile completed (no redirect happened)');
        // If we reach here, something went wrong (no redirect happened)
        toast({
          title: "Error",
          description: "Profile saved but navigation failed.",
          variant: "destructive",
        });
      } catch (error: any) {
        console.log('🔵 createCompanyProfile threw error:', error);
        
        // Next.js redirect() throws a NEXT_REDIRECT error - this is EXPECTED behavior
        // We should NOT catch it, let it propagate to trigger the redirect
        
        // Only handle actual errors (not redirects)
        if (error?.digest?.startsWith('NEXT_REDIRECT')) {
          console.log('🔵 This is a redirect, re-throwing...');
          // This is a successful redirect, let it through
          throw error;
        }
        
        // This is a real error
        console.error("🔴 Failed to create profile:", error);
        toast({
          title: "Save Failed",
          description: error?.message || "An unexpected error occurred.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="legalName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Legal Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Acme Trucking LLC" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dba"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Doing Business As (DBA)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Acme Freight" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="e.g., (555) 123-4567" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ein"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Employer Identification Number (EIN)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 12-3456789" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="dotNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department of Transportation #</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 1234567" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mcNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Master Carrier #</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 987654" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="hqAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>HQ Address</FormLabel>
              <FormControl>
                <Input placeholder="e.g., 123 Main St, Anytown, USA 12345" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <FormField
                control={form.control}
                name="loadLocation"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Primary Load Location</FormLabel>
                    <FormControl>
                    <Input placeholder="e.g., Los Angeles, CA" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="serviceRegions"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Service Regions</FormLabel>
                    <FormControl>
                    <Input placeholder="e.g., West Coast, Midwest" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={!formState.isValid || isPending}>
            {isPending ? "Saving..." : "Save Profile and Continue"}
          </Button>
        </div>
      </form>
    </Form>
  );
}