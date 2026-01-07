
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

const profileFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  cdlLicense: z.string().min(1, "CDL Number is required"),
  cdlExpiry: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
  medicalCardExpiry: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
  insuranceExpiry: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
  location: z.string().min(1, "Your current city/state is required"),
  vehicleType: z.enum(['Dry Van', 'Reefer', 'Flatbed']),
  password: z.string().min(6, "Password must be at least 6 characters"),
  motorVehicleRecordNumber: z.string().min(1, "MVR Number is required"),
  backgroundCheckDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
  preEmploymentScreeningDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
  drugAndAlcoholScreeningDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface DriverRegisterFormProps {
    driverId: string;
    ownerId: string;
    invitationEmail: string;
}

export function DriverRegisterForm({ driverId, ownerId, invitationEmail }: DriverRegisterFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: "onChange",
    defaultValues: {
      firstName: "",
      lastName: "",
      phoneNumber: "",
      cdlLicense: "",
      location: "",
      vehicleType: "Dry Van",
      password: "",
      motorVehicleRecordNumber: "",
    },
  });

  const { formState } = form;

  const onSubmit = (values: ProfileFormValues) => {
    startTransition(async () => {
      const { password, firstName, lastName, ...profileData } = values;

      try {
        console.log('🔵 Creating driver account...');
        
        const response = await fetch('/api/create-driver-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: invitationEmail,
            password: password,
            token: driverId,
            ownerId: ownerId,
            profileData: {
              ...profileData,
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
      }
    });
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

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
           <FormField
            control={form.control}
            name="motorVehicleRecordNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motor Driver # (MVR)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 987654321" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
             <FormField
                control={form.control}
                name="cdlExpiry"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>CDL Expiry</FormLabel>
                    <FormControl>
                        <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="medicalCardExpiry"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Medical Card Expiry</FormLabel>
                    <FormControl>
                        <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="insuranceExpiry"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Insurance Expiry</FormLabel>
                    <FormControl>
                        <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
        </div>
        
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
             <FormField
                control={form.control}
                name="backgroundCheckDate"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Background Check</FormLabel>
                    <FormControl>
                        <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="preEmploymentScreeningDate"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Pre-Employment Screen</FormLabel>
                    <FormControl>
                        <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="drugAndAlcoholScreeningDate"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Drug & Alcohol Screen</FormLabel>
                    <FormControl>
                        <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
        </div>
        
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
        </div>
        

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={!formState.isValid || isPending}>
            {isPending ? "Saving..." : "Complete Registration"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
