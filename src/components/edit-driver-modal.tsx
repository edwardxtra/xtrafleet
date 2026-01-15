"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useAuth, useFirestore } from "@/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { showSuccess, showError } from "@/lib/toast-utils";
import type { Driver } from "@/lib/data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TRAILER_TYPES } from "@/lib/trailer-types";

interface EditDriverModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Driver | null;
  onSuccess?: () => void;
}

export function EditDriverModal({ open, onOpenChange, driver, onSuccess }: EditDriverModalProps) {
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    location: "",
    phoneNumber: "",
    vehicleType: "dry-van" as string,
    availability: "Available" as "Available" | "On-trip" | "Off-duty",
    profileSummary: "",
    cdlLicense: "",
    cdlExpiry: "",
    medicalCardExpiry: "",
    insuranceExpiry: "",
    motorVehicleRecordNumber: "",
    backgroundCheckDate: "",
    preEmploymentScreeningDate: "",
    drugAndAlcoholScreeningDate: "",
  });

  useEffect(() => {
    if (driver) {
      setFormData({
        name: driver.name || "",
        email: driver.email || "",
        location: driver.location || "",
        phoneNumber: driver.phoneNumber || driver.phone || "",
        vehicleType: driver.vehicleType || "dry-van",
        availability: driver.availability || "Available",
        profileSummary: driver.profileSummary || "",
        cdlLicense: driver.cdlLicense || "",
        cdlExpiry: driver.cdlExpiry?.split("T")[0] || "",
        medicalCardExpiry: driver.medicalCardExpiry?.split("T")[0] || "",
        insuranceExpiry: driver.insuranceExpiry?.split("T")[0] || "",
        motorVehicleRecordNumber: driver.motorVehicleRecordNumber || "",
        backgroundCheckDate: driver.backgroundCheckDate?.split("T")[0] || "",
        preEmploymentScreeningDate: driver.preEmploymentScreeningDate?.split("T")[0] || "",
        drugAndAlcoholScreeningDate: driver.drugAndAlcoholScreeningDate?.split("T")[0] || "",
      });
    }
  }, [driver]);

  // Helper to validate and format dates - returns null for invalid/empty dates
  const formatDateForFirestore = (dateStr: string) => {
    if (!dateStr || dateStr.trim() === "") return null;
    
    // Check if it's a valid date
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      
      // Return as yyyy-mm-dd format
      return dateStr;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driver || !firestore || !auth.currentUser) return;

    setIsLoading(true);
    try {
      const driverRef = doc(firestore, `owner_operators/${auth.currentUser.uid}/drivers/${driver.id}`);
      
      // Build update object - only include fields that have values
      const updateData: any = {};
      
      // Always update basic fields (even if empty)
      if (formData.name) updateData.name = formData.name;
      if (formData.email) updateData.email = formData.email;
      if (formData.location) updateData.location = formData.location;
      if (formData.phoneNumber) updateData.phoneNumber = formData.phoneNumber;
      if (formData.vehicleType) updateData.vehicleType = formData.vehicleType;
      if (formData.availability) updateData.availability = formData.availability;
      if (formData.profileSummary) updateData.profileSummary = formData.profileSummary;
      
      // Optional text fields
      if (formData.cdlLicense) updateData.cdlLicense = formData.cdlLicense;
      if (formData.motorVehicleRecordNumber) updateData.motorVehicleRecordNumber = formData.motorVehicleRecordNumber;

      // Date fields - only add if valid
      const cdlExpiry = formatDateForFirestore(formData.cdlExpiry);
      if (cdlExpiry !== null) updateData.cdlExpiry = cdlExpiry;
      
      const medicalCardExpiry = formatDateForFirestore(formData.medicalCardExpiry);
      if (medicalCardExpiry !== null) updateData.medicalCardExpiry = medicalCardExpiry;
      
      const insuranceExpiry = formatDateForFirestore(formData.insuranceExpiry);
      if (insuranceExpiry !== null) updateData.insuranceExpiry = insuranceExpiry;
      
      const backgroundCheckDate = formatDateForFirestore(formData.backgroundCheckDate);
      if (backgroundCheckDate !== null) updateData.backgroundCheckDate = backgroundCheckDate;
      
      const preEmploymentScreeningDate = formatDateForFirestore(formData.preEmploymentScreeningDate);
      if (preEmploymentScreeningDate !== null) updateData.preEmploymentScreeningDate = preEmploymentScreeningDate;
      
      const drugAndAlcoholScreeningDate = formatDateForFirestore(formData.drugAndAlcoholScreeningDate);
      if (drugAndAlcoholScreeningDate !== null) updateData.drugAndAlcoholScreeningDate = drugAndAlcoholScreeningDate;

      console.log("Updating driver with data:", updateData);
      await updateDoc(driverRef, updateData);

      showSuccess("Driver profile saved successfully");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Update error:", error);
      showError(error.message || "Failed to update driver profile");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-headline">Edit Driver Profile</DialogTitle>
          <DialogDescription>
            Update any fields below. You can save incomplete forms and finish later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone Number</Label>
                  <Input
                    id="edit-phone"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="(123) 456-7890"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-location">Location</Label>
                  <Input
                    id="edit-location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="e.g., Miami, FL"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Trailer/Vehicle Type</Label>
                  <Select
                    value={formData.vehicleType}
                    onValueChange={(value) => setFormData({ ...formData, vehicleType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAILER_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Availability</Label>
                  <Select
                    value={formData.availability}
                    onValueChange={(value: "Available" | "On-trip" | "Off-duty") =>
                      setFormData({ ...formData, availability: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Available">Available</SelectItem>
                      <SelectItem value="On-trip">On-trip</SelectItem>
                      <SelectItem value="Off-duty">Off-duty</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-summary">Profile Summary</Label>
                <Textarea
                  id="edit-summary"
                  value={formData.profileSummary}
                  onChange={(e) => setFormData({ ...formData, profileSummary: e.target.value })}
                  placeholder="Brief description of experience and specializations..."
                  rows={3}
                />
              </div>
            </TabsContent>

            <TabsContent value="compliance" className="space-y-4 pt-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-900">
                  💡 <strong>Tip:</strong> You can save partial information and complete the rest later.
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-cdl">CDL License Number</Label>
                    <Input
                      id="edit-cdl"
                      value={formData.cdlLicense}
                      onChange={(e) => setFormData({ ...formData, cdlLicense: e.target.value })}
                      placeholder="e.g., D12345678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-cdl-expiry">CDL Expiry Date</Label>
                    <Input
                      id="edit-cdl-expiry"
                      type="date"
                      value={formData.cdlExpiry}
                      onChange={(e) => setFormData({ ...formData, cdlExpiry: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-medical-expiry">Medical Card Expiry</Label>
                    <Input
                      id="edit-medical-expiry"
                      type="date"
                      value={formData.medicalCardExpiry}
                      onChange={(e) => setFormData({ ...formData, medicalCardExpiry: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-insurance-expiry">Insurance Expiry</Label>
                    <Input
                      id="edit-insurance-expiry"
                      type="date"
                      value={formData.insuranceExpiry}
                      onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-mvr">Motor Vehicle Record Number</Label>
                  <Input
                    id="edit-mvr"
                    value={formData.motorVehicleRecordNumber}
                    onChange={(e) => setFormData({ ...formData, motorVehicleRecordNumber: e.target.value })}
                    placeholder="e.g., 987654321"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-background">Background Check Date</Label>
                    <Input
                      id="edit-background"
                      type="date"
                      value={formData.backgroundCheckDate}
                      onChange={(e) => setFormData({ ...formData, backgroundCheckDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-preemployment">Pre-Employment Date</Label>
                    <Input
                      id="edit-preemployment"
                      type="date"
                      value={formData.preEmploymentScreeningDate}
                      onChange={(e) => setFormData({ ...formData, preEmploymentScreeningDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-drug">Drug Screen Date</Label>
                    <Input
                      id="edit-drug"
                      type="date"
                      value={formData.drugAndAlcoholScreeningDate}
                      onChange={(e) => setFormData({ ...formData, drugAndAlcoholScreeningDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
