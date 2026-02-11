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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createCompanyProfile } from "@/lib/actions";
import { useTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/firebase";
import { useFirestore } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useEffect } from "react";
import { US_STATES } from "@/lib/us-states";
import { X, Search, ChevronDown } from "lucide-react";
import { COIUploadSection, type COIData } from "@/components/coi-upload-section";

const profileFormSchema = z.object({
  legalName: z.string().min(1, "Legal name is required"),
  phone: z.string().optional(),
  dotNumber: z.string().min(1, "DOT number is required"),
  mcNumber: z.string().min(1, "MC number is required"),
  hqAddress: z.string().min(1, "HQ address is required"),
  operatingStates: z.array(z.string()).min(1, "Select at least one operating state"),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function CompanyProfileForm() {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const { user } = useUser();
  const db = useFirestore();
  const [stateSearch, setStateSearch] = useState("");
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [coiData, setCoiData] = useState<COIData>({});

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: "onChange",
    defaultValues: {
      legalName: "",
      phone: "",
      dotNumber: "",
      mcNumber: "",
      hqAddress: "",
      operatingStates: [],
    },
  });

  const selectedStates = form.watch("operatingStates") || [];

  // Pre-fill legal name from registration company name
  useEffect(() => {
    async function loadCompanyName() {
      if (!user || !db) return;
      try {
        const ownerDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (ownerDoc.exists()) {
          const data = ownerDoc.data();
          const name = data.legalName || data.companyName || '';
          if (name) {
            form.setValue('legalName', name);
          }
        }
      } catch (error) {
        console.error('Failed to load company name:', error);
      }
    }
    loadCompanyName();
  }, [user, db, form]);

  const toggleState = (stateValue: string) => {
    const current = form.getValues("operatingStates");
    if (current.includes(stateValue)) {
      form.setValue("operatingStates", current.filter(s => s !== stateValue), { shouldValidate: true });
    } else {
      form.setValue("operatingStates", [...current, stateValue], { shouldValidate: true });
    }
  };

  const removeState = (stateValue: string) => {
    const current = form.getValues("operatingStates");
    form.setValue("operatingStates", current.filter(s => s !== stateValue), { shouldValidate: true });
  };

  const filteredStates = US_STATES.filter(state =>
    state.label.toLowerCase().includes(stateSearch.toLowerCase()) ||
    state.value.toLowerCase().includes(stateSearch.toLowerCase())
  );

  const { formState } = form;

  const onSubmit = (values: ProfileFormValues) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append('legalName', values.legalName);
      formData.append('phone', values.phone || '');
      formData.append('dotNumber', values.dotNumber);
      formData.append('mcNumber', values.mcNumber);
      formData.append('hqAddress', values.hqAddress);
      formData.append('operatingStates', JSON.stringify(values.operatingStates));
      formData.append('coiData', JSON.stringify(coiData));
      
      try {
        await createCompanyProfile(formData);
        toast({
          title: "Error",
          description: "Profile saved but navigation failed.",
          variant: "destructive",
        });
      } catch (error: any) {
        // Next.js redirect() throws a NEXT_REDIRECT error - this is EXPECTED behavior
        if (error?.digest?.startsWith('NEXT_REDIRECT')) {
          throw error;
        }
        
        console.error("Failed to create profile:", error);
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
        <FormField
          control={form.control}
          name="legalName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Legal Name</FormLabel>
              <FormControl>
                <Input {...field} disabled readOnly className="bg-muted" />
              </FormControl>
              <p className="text-xs text-muted-foreground">Auto-filled from registration. Contact support to change.</p>
              <FormMessage />
            </FormItem>
          )}
        />

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

        {/* Operating States - Searchable Multi-Select */}
        <FormField
          control={form.control}
          name="operatingStates"
          render={() => (
            <FormItem>
              <FormLabel>Operating States</FormLabel>
              <p className="text-sm text-muted-foreground mb-2">Select all states where you operate</p>
              
              {/* Selected states badges */}
              {selectedStates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedStates.map(stateVal => {
                    const state = US_STATES.find(s => s.value === stateVal);
                    return (
                      <Badge key={stateVal} variant="secondary" className="pl-2 pr-1 py-1 gap-1">
                        {state?.label || stateVal}
                        <button
                          type="button"
                          onClick={() => removeState(stateVal)}
                          className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* Dropdown trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStateDropdownOpen(!stateDropdownOpen)}
                  className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <span className="text-muted-foreground">
                    {selectedStates.length === 0
                      ? "Select states..."
                      : `${selectedStates.length} state${selectedStates.length === 1 ? '' : 's'} selected`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </button>

                {stateDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                    {/* Search input */}
                    <div className="flex items-center border-b px-3 py-2">
                      <Search className="h-4 w-4 text-muted-foreground mr-2" />
                      <input
                        type="text"
                        placeholder="Search states..."
                        value={stateSearch}
                        onChange={(e) => setStateSearch(e.target.value)}
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        autoFocus
                      />
                    </div>
                    
                    {/* Select All / Clear */}
                    <div className="flex justify-between px-3 py-1.5 border-b text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          form.setValue("operatingStates", US_STATES.map(s => s.value), { shouldValidate: true });
                        }}
                        className="text-primary hover:underline"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          form.setValue("operatingStates", [], { shouldValidate: true });
                        }}
                        className="text-muted-foreground hover:underline"
                      >
                        Clear All
                      </button>
                    </div>

                    {/* State list */}
                    <div className="max-h-60 overflow-y-auto p-1">
                      {filteredStates.map(state => (
                        <button
                          key={state.value}
                          type="button"
                          onClick={() => toggleState(state.value)}
                          className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent ${
                            selectedStates.includes(state.value) ? 'bg-accent/50 font-medium' : ''
                          }`}
                        >
                          <div className={`h-4 w-4 rounded border flex items-center justify-center ${
                            selectedStates.includes(state.value)
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-input'
                          }`}>
                            {selectedStates.includes(state.value) && (
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span>{state.label}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{state.value}</span>
                        </button>
                      ))}
                      {filteredStates.length === 0 && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">No states found</p>
                      )}
                    </div>

                    {/* Done button */}
                    <div className="border-t p-2">
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setStateDropdownOpen(false);
                          setStateSearch("");
                        }}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* COI Upload Section */}
        <COIUploadSection onCoiChange={setCoiData} />

        <div className="flex justify-end">
          <Button type="submit" disabled={!formState.isValid || isPending}>
            {isPending ? "Saving..." : "Save Profile and Continue"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
