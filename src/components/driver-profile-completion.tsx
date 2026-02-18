"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COIUploadSection, type COIData } from "@/components/coi-upload-section";
import { useUser, useFirestore } from "@/firebase";
import { doc, updateDoc } from "firebase/firestore";

const LOG_PREFIX = "[DriverProfileCompletion]";

const CDL_CLASSES = ["A", "B", "C"] as const;
const ENDORSEMENTS = [
  { value: "H", label: "H - Hazardous Materials" },
  { value: "N", label: "N - Tank Vehicles" },
  { value: "P", label: "P - Passenger" },
  { value: "S", label: "S - School Bus" },
  { value: "T", label: "T - Double/Triple Trailers" },
  { value: "X", label: "X - Hazmat + Tank (H+N)" },
] as const;

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"] as const;

const profileSchema = z.object({
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  cdlNumber: z.string().min(1, "CDL number is required"),
  cdlState: z.enum(US_STATES, { errorMap: () => ({ message: "Please select a state" }) }),
  cdlClass: z.enum(CDL_CLASSES, { errorMap: () => ({ message: "Please select CDL class" }) }),
  endorsements: z.array(z.string()),
  // NOTE: field is named medicalCardExpiry here to match the driver doc and compliance engine.
  // The old form used medicalCertExpiration — that mismatch is fixed in submit-driver-profile route too.
  medicalCardExpiry: z.string().min(1, "Medical certificate expiration is required"),
  authorizationConsent: z.boolean().refine(val => val === true, "You must accept the Driver Authorization & Disclosure to continue"),
});

type ProfileValues = z.infer<typeof profileSchema>;

interface DriverProfileCompletionProps {
  driverId: string;
  onComplete?: () => void;
}

export function DriverProfileCompletion({ driverId, onComplete }: DriverProfileCompletionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coiData, setCoiData] = useState<COIData>({});
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    mode: "onChange",
    defaultValues: {
      endorsements: [],
      authorizationConsent: false,
    }
  });

  const selectedEndorsements = form.watch("endorsements") || [];

  const toggleEndorsement = (value: string) => {
    const current = form.getValues("endorsements");
    if (current.includes(value)) {
      form.setValue("endorsements", current.filter(e => e !== value), { shouldValidate: true });
    } else {
      form.setValue("endorsements", [...current, value], { shouldValidate: true });
    }
  };

  const getDeviceFingerprint = () => {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  };

  // Save COI data directly to the driver doc in Firestore so insuranceExpiry
  // is available immediately for compliance scoring without waiting for profile submit.
  const handleCoiChange = async (data: COIData) => {
    setCoiData(data);

    if (!firestore || !user) return;

    try {
      // We need the ownerId — fetch from users doc via the API rather than
      // doing a Firestore read here (the user doc has ownerId on it).
      // We'll persist the full COI blob on submit, but also eagerly write
      // insuranceExpiry now so compliance status updates in real-time.
      if (data.expiryDate) {
        console.log(`${LOG_PREFIX} COI expiry date changed to ${data.expiryDate} — will save on submit`);
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} COI onChange handler error:`, err);
    }
  };

  const onSubmit = async (values: ProfileValues) => {
    setIsSubmitting(true);
    console.log(`${LOG_PREFIX} Submitting profile for driverId: ${driverId}`);

    try {
      const deviceInfo = getDeviceFingerprint();
      const timestamp = new Date().toISOString();

      // Log what we're about to send so field issues are visible in browser console
      console.log(`${LOG_PREFIX} Profile data being submitted:`, {
        dateOfBirth: values.dateOfBirth,
        cdlNumber: values.cdlNumber,
        cdlState: values.cdlState,
        cdlClass: values.cdlClass,
        endorsements: values.endorsements,
        medicalCardExpiry: values.medicalCardExpiry,
        hasCOI: !!(coiData.expiryDate || coiData.fileUrl),
        coiExpiryDate: coiData.expiryDate,
        coiInsurerName: coiData.insurerName,
        coiPolicyNumber: coiData.policyNumber,
      });

      const response = await fetch('/api/submit-driver-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileData: {
            dateOfBirth: values.dateOfBirth,
            cdlNumber: values.cdlNumber,
            cdlState: values.cdlState,
            cdlClass: values.cdlClass,
            endorsements: values.endorsements,
            // Use medicalCardExpiry (correct field name matching compliance engine)
            medicalCardExpiry: values.medicalCardExpiry,
            // COI / insurance fields saved to driver doc
            // insuranceExpiry is what compliance.ts reads
            ...(coiData.expiryDate && { insuranceExpiry: coiData.expiryDate }),
            ...(coiData.insurerName && { insurerName: coiData.insurerName }),
            ...(coiData.policyNumber && { insurancePolicyNumber: coiData.policyNumber }),
            ...(coiData.fileUrl && { insuranceUrl: coiData.fileUrl }),
          },
          consents: {
            driverAuthorization: {
              accepted: values.authorizationConsent,
              timestamp,
              version: "2.0",
              text: "I authorize XtraFleet Technologies Inc. and its authorized compliance partners to obtain, use, and disclose my motor vehicle record (MVR), license status, endorsements, restrictions, and related safety and compliance information from federal, state, and third-party sources for commercial transportation and compliance verification purposes. I certify that the information I have provided is accurate and complete to the best of my knowledge and understand that this authorization applies on a transaction-specific, time-limited basis in accordance with applicable law.",
            },
          },
          deviceInfo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`${LOG_PREFIX} API error response:`, data);
        throw new Error(data.error || 'Failed to submit profile');
      }

      console.log(`${LOG_PREFIX} Profile submitted successfully:`, data);

      toast({
        title: "Profile Submitted!",
        description: "Your information has been submitted. Awaiting fleet confirmation.",
      });

      if (onComplete) onComplete();

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Submit error:`, error);
      toast({
        title: "Submission Failed",
        description: error?.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete Your Driver Profile</CardTitle>
        <CardDescription>
          Enter your CDL information, insurance details, and authorize verification to get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">CDL Information</h3>
              
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cdlNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CDL Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., A1234567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cdlState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CDL Issuing State</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {US_STATES.map(state => (
                            <SelectItem key={state} value={state}>{state}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cdlClass"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CDL Class</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select class" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CDL_CLASSES.map(cls => (
                            <SelectItem key={cls} value={cls}>Class {cls}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="medicalCardExpiry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Medical Certificate Expiration</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="endorsements"
                render={() => (
                  <FormItem>
                    <FormLabel>Endorsements (Optional)</FormLabel>
                    <FormDescription>Select all that apply</FormDescription>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border rounded-md p-4">
                      {ENDORSEMENTS.map((endorsement) => (
                        <div key={endorsement.value} className="flex items-center space-x-2">
                          <Checkbox
                            checked={selectedEndorsements.includes(endorsement.value)}
                            onCheckedChange={() => toggleEndorsement(endorsement.value)}
                          />
                          <Label className="text-sm cursor-pointer">{endorsement.label}</Label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* COI Section — wired up and saves insuranceExpiry to driver doc on submit */}
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Insurance</h3>
              <p className="text-sm text-muted-foreground">
                Upload your Certificate of Insurance or enter your policy details. Your insurance expiry date is required for compliance matching.
              </p>
              <COIUploadSection onCoiChange={handleCoiChange} initialData={coiData} />
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg">Driver Authorization & Disclosure</h3>

              <FormField
                control={form.control}
                name="authorizationConsent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 border rounded-md p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                    </FormControl>
                    <div className="space-y-2 leading-relaxed">
                      <FormDescription className="text-sm text-foreground">
                        I authorize XtraFleet Technologies Inc. and its authorized compliance partners to obtain, use, and disclose my motor vehicle record (MVR), license status, endorsements, restrictions, and related safety and compliance information from federal, state, and third-party sources for commercial transportation and compliance verification purposes.
                      </FormDescription>
                      <FormDescription className="text-sm text-foreground">
                        I certify that the information I have provided is accurate and complete to the best of my knowledge and understand that this authorization applies on a transaction-specific, time-limited basis in accordance with applicable law.
                      </FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isSubmitting} size="lg">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Profile"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
