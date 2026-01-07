"use client";

import { useState } from "react";
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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { DocumentUpload } from "@/components/ui/document-upload";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { format } from "date-fns";

const profileFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  cdlLicense: z.string().min(1, "CDL Number is required"),
  cdlExpiry: z.date({ required_error: "CDL expiry date is required" }),
  medicalCardExpiry: z.date({ required_error: "Medical card expiry is required" }),
  insuranceExpiry: z.date({ required_error: "Insurance expiry is required" }),
  location: z.string().min(1, "Your current city/state is required"),
  vehicleType: z.enum(['Dry Van', 'Reefer', 'Flatbed']),
  password: z.string().min(6, "Password must be at least 6 characters"),
  motorVehicleRecordNumber: z.string().min(1, "MVR Number is required"),
  backgroundCheckDate: z.date({ required_error: "Background check date is required" }),
  preEmploymentScreeningDate: z.date({ required_error: "Pre-employment screening date is required" }),
  drugAndAlcoholScreeningDate: z.date({ required_error: "Drug screening date is required" }),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface DriverRegisterFormProps {
  driverId: string;
  ownerId: string;
  invitationEmail: string;
}

export function DriverRegisterForm({ driverId, ownerId, invitationEmail }: DriverRegisterFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  // File state
  const [cdlDocument, setCdlDocument] = useState<File | null>(null);
  const [medicalCardDocument, setMedicalCardDocument] = useState<File | null>(null);
  const [insuranceDocument, setInsuranceDocument] = useState<File | null>(null);
  const [mvrDocument, setMvrDocument] = useState<File | null>(null);
  const [backgroundCheckDocument, setBackgroundCheckDocument] = useState<File | null>(null);
  const [preEmploymentDocument, setPreEmploymentDocument] = useState<File | null>(null);
  const [drugScreenDocument, setDrugScreenDocument] = useState<File | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: "onChange",
  });

  const uploadDocument = async (file: File, path: string): Promise<string> => {
    const storage = getStorage();
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const onSubmit = async (values: ProfileFormValues) => {
    setIsSubmitting(true);

    try {
      console.log('🔵 Uploading documents...');

      // Upload all documents to Firebase Storage
      const documentUrls: Record<string, string> = {};

      if (cdlDocument) {
        documentUrls.cdlDocumentUrl = await uploadDocument(
          cdlDocument,
          `owner_operators/${ownerId}/drivers/${driverId}/cdl_${Date.now()}.${cdlDocument.name.split('.').pop()}`
        );
      }

      if (medicalCardDocument) {
        documentUrls.medicalCardDocumentUrl = await uploadDocument(
          medicalCardDocument,
          `owner_operators/${ownerId}/drivers/${driverId}/medical_${Date.now()}.${medicalCardDocument.name.split('.').pop()}`
        );
      }

      if (insuranceDocument) {
        documentUrls.insuranceDocumentUrl = await uploadDocument(
          insuranceDocument,
          `owner_operators/${ownerId}/drivers/${driverId}/insurance_${Date.now()}.${insuranceDocument.name.split('.').pop()}`
        );
      }

      if (mvrDocument) {
        documentUrls.mvrDocumentUrl = await uploadDocument(
          mvrDocument,
          `owner_operators/${ownerId}/drivers/${driverId}/mvr_${Date.now()}.${mvrDocument.name.split('.').pop()}`
        );
      }

      if (backgroundCheckDocument) {
        documentUrls.backgroundCheckDocumentUrl = await uploadDocument(
          backgroundCheckDocument,
          `owner_operators/${ownerId}/drivers/${driverId}/background_${Date.now()}.${backgroundCheckDocument.name.split('.').pop()}`
        );
      }

      if (preEmploymentDocument) {
        documentUrls.preEmploymentScreeningDocumentUrl = await uploadDocument(
          preEmploymentDocument,
          `owner_operators/${ownerId}/drivers/${driverId}/preemployment_${Date.now()}.${preEmploymentDocument.name.split('.').pop()}`
        );
      }

      if (drugScreenDocument) {
        documentUrls.drugAndAlcoholScreeningDocumentUrl = await uploadDocument(
          drugScreenDocument,
          `owner_operators/${ownerId}/drivers/${driverId}/drugscreen_${Date.now()}.${drugScreenDocument.name.split('.').pop()}`
        );
      }

      console.log('✅ Documents uploaded');
      console.log('🔵 Creating driver account...');

      const { password, firstName, lastName, ...profileData } = values;

      // Convert dates to ISO strings
      const formattedData = {
        ...profileData,
        cdlExpiry: format(profileData.cdlExpiry, 'yyyy-MM-dd'),
        medicalCardExpiry: format(profileData.medicalCardExpiry, 'yyyy-MM-dd'),
        insuranceExpiry: format(profileData.insuranceExpiry, 'yyyy-MM-dd'),
        backgroundCheckDate: format(profileData.backgroundCheckDate, 'yyyy-MM-dd'),
        preEmploymentScreeningDate: format(profileData.preEmploymentScreeningDate, 'yyyy-MM-dd'),
        drugAndAlcoholScreeningDate: format(profileData.drugAndAlcoholScreeningDate, 'yyyy-MM-dd'),
      };

      const response = await fetch('/api/create-driver-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: invitationEmail,
          password: password,
          token: driverId,
          ownerId: ownerId,
          profileData: {
            ...formattedData,
            ...documentUrls,
            name: `${firstName} ${lastName}`,
            firstName,
            lastName,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create account');
      }

      console.log('✅ Driver account created successfully');

      toast({
        title: "Profile Created!",
        description: "Your driver profile has been successfully created. Please log in.",
      });

      router.push('/login');

    } catch (error: any) {
      console.error('❌ Failed to create driver profile:', error);
      toast({
        title: "Registration Failed",
        description: error?.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <p className="text-sm text-muted-foreground">First, set a password for your new account.</p>
        
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
            </FormItem>
          )}
        />

        <hr className="my-6" />

        <p className="text-sm text-muted-foreground">Now, please fill out your driver profile details.</p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                  <SelectItem value="Dry Van">Dry Van</SelectItem>
                  <SelectItem value="Reefer">Reefer (Refrigerated)</SelectItem>
                  <SelectItem value="Flatbed">Flatbed</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <hr className="my-6" />
        <h3 className="text-lg font-semibold">CDL Information</h3>

        <FormField
          control={form.control}
          name="cdlLicense"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CDL License Number</FormLabel>
              <FormControl>
                <Input placeholder="e.g., D12345678" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="cdlExpiry"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>CDL Expiry Date</FormLabel>
                <DatePicker
                  date={field.value}
                  onDateChange={field.onChange}
                  placeholder="Select expiry date"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem>
            <FormLabel>CDL Document (Optional)</FormLabel>
            <DocumentUpload
              onFileSelect={setCdlDocument}
              disabled={isSubmitting}
            />
            <FormDescription>Upload a copy of your CDL</FormDescription>
          </FormItem>
        </div>

        <hr className="my-6" />
        <h3 className="text-lg font-semibold">Medical Card</h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="medicalCardExpiry"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Medical Card Expiry Date</FormLabel>
                <DatePicker
                  date={field.value}
                  onDateChange={field.onChange}
                  placeholder="Select expiry date"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem>
            <FormLabel>Medical Card Document (Optional)</FormLabel>
            <DocumentUpload
              onFileSelect={setMedicalCardDocument}
              disabled={isSubmitting}
            />
            <FormDescription>Upload a copy of your medical card</FormDescription>
          </FormItem>
        </div>

        <hr className="my-6" />
        <h3 className="text-lg font-semibold">Insurance</h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="insuranceExpiry"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Insurance Expiry Date</FormLabel>
                <DatePicker
                  date={field.value}
                  onDateChange={field.onChange}
                  placeholder="Select expiry date"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem>
            <FormLabel>Insurance Document (Optional)</FormLabel>
            <DocumentUpload
              onFileSelect={setInsuranceDocument}
              disabled={isSubmitting}
            />
            <FormDescription>Upload proof of insurance</FormDescription>
          </FormItem>
        </div>

        <hr className="my-6" />
        <h3 className="text-lg font-semibold">Motor Vehicle Record</h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="motorVehicleRecordNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>MVR Number</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 987654321" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem>
            <FormLabel>MVR Document (Optional)</FormLabel>
            <DocumentUpload
              onFileSelect={setMvrDocument}
              disabled={isSubmitting}
            />
            <FormDescription>Upload your MVR</FormDescription>
          </FormItem>
        </div>

        <hr className="my-6" />
        <h3 className="text-lg font-semibold">Background & Screenings</h3>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="backgroundCheckDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Background Check Date</FormLabel>
                  <DatePicker
                    date={field.value}
                    onDateChange={field.onChange}
                    placeholder="Select date completed"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel>Background Check Document (Optional)</FormLabel>
              <DocumentUpload
                onFileSelect={setBackgroundCheckDocument}
                disabled={isSubmitting}
              />
              <FormDescription>Upload background check results</FormDescription>
            </FormItem>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="preEmploymentScreeningDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Pre-Employment Screening Date</FormLabel>
                  <DatePicker
                    date={field.value}
                    onDateChange={field.onChange}
                    placeholder="Select date completed"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel>Pre-Employment Screening Document (Optional)</FormLabel>
              <DocumentUpload
                onFileSelect={setPreEmploymentDocument}
                disabled={isSubmitting}
              />
              <FormDescription>Upload screening results</FormDescription>
            </FormItem>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="drugAndAlcoholScreeningDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Drug & Alcohol Screening Date</FormLabel>
                  <DatePicker
                    date={field.value}
                    onDateChange={field.onChange}
                    placeholder="Select date completed"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel>Drug & Alcohol Screening Document (Optional)</FormLabel>
              <DocumentUpload
                onFileSelect={setDrugScreenDocument}
                disabled={isSubmitting}
              />
              <FormDescription>Upload drug test results</FormDescription>
            </FormItem>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Complete Registration"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
