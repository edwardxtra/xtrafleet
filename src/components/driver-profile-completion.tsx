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
  medicalCertExpiration: z.string().min(1, "Medical certificate expiration is required"),
  accuracyConsent: z.boolean().refine(val => val === true, "Required"),
  verificationConsent: z.boolean().refine(val => val === true, "Required"),
  employmentConsent: z.boolean().refine(val => val === true, "Required"),
  tripLeasingConsent: z.boolean().refine(val => val === true, "Required"),
  electronicRecordsConsent: z.boolean().refine(val => val === true, "Required"),
});

type ProfileValues = z.infer<typeof profileSchema>;

interface DriverProfileCompletionProps {
  driverId: string;
  onComplete?: () => void;
}

export function DriverProfileCompletion({ driverId, onComplete }: DriverProfileCompletionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    mode: "onChange",
    defaultValues: {
      endorsements: [],
      accuracyConsent: false,
      verificationConsent: false,
      employmentConsent: false,
      tripLeasingConsent: false,
      electronicRecordsConsent: false,
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

  const getIPAddress = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  };

  const onSubmit = async (values: ProfileValues) => {
    setIsSubmitting(true);

    try {
      const deviceInfo = getDeviceFingerprint();
      const timestamp = new Date().toISOString();

      // Build payload matching API expectations: { profileData, consents, deviceInfo }
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
            medicalCertExpiration: values.medicalCertExpiration,
          },
          consents: {
            accuracy: { 
              accepted: values.accuracyConsent, 
              timestamp, 
              version: "1.0"
            },
            verification: { 
              accepted: values.verificationConsent, 
              timestamp, 
              version: "1.0"
            },
            employment: { 
              accepted: values.employmentConsent, 
              timestamp, 
              version: "1.0"
            },
            tripLeasing: { 
              accepted: values.tripLeasingConsent, 
              timestamp, 
              version: "1.0"
            },
            electronicRecords: { 
              accepted: values.electronicRecordsConsent, 
              timestamp, 
              version: "1.0"
            },
          },
          deviceInfo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit profile');
      }

      toast({
        title: "Profile Submitted! 🎉",
        description: "Your information has been submitted. Awaiting fleet attestation.",
      });

      if (onComplete) onComplete();

    } catch (error: any) {
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
          Enter your CDL information and consent to verification. No document uploads required.
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
                  name="medicalCertExpiration"
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

            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg">Required Consents</h3>
              <p className="text-sm text-muted-foreground">All consents are required to complete your profile.</p>

              <FormField
                control={form.control}
                name="accuracyConsent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 border rounded-md p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Accuracy Certification</FormLabel>
                      <FormDescription>
                        I certify that the information I have provided about myself, including my date of birth, commercial driver's license information, endorsements, and medical certificate expiration date, is true and accurate to the best of my knowledge.
                      </FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="verificationConsent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 border rounded-md p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Verification Consent</FormLabel>
                      <FormDescription>
                        I authorize XtraFleet Technologies Inc. to verify my commercial driver's license status, endorsements, and eligibility through applicable government and third-party databases, including the FMCSA Drug & Alcohol Clearinghouse, as permitted by law.
                      </FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="employmentConsent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 border rounded-md p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Employment Acknowledgment</FormLabel>
                      <FormDescription>
                        I acknowledge that I remain an employee or contractor of my employing carrier and that XtraFleet is not my employer, dispatcher, broker, or agent.
                      </FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tripLeasingConsent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 border rounded-md p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Trip Leasing Acknowledgment</FormLabel>
                      <FormDescription>
                        I understand that I may be temporarily leased to another carrier for specific trips and that responsibility for my qualification and employment remains with my employing carrier.
                      </FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="electronicRecordsConsent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 border rounded-md p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Electronic Records & Signature Consent</FormLabel>
                      <FormDescription>
                        I consent to the use of electronic records and signatures in connection with my participation on the XtraFleet platform.
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
