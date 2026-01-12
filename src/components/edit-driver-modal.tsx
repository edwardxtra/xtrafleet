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
    vehicleType: "Dry Van" as "Dry Van" | "Reefer" | "Flatbed",
    availability: "Available" as "Available" | "On-trip" | "Off-duty",
    profileSummary: "",
    cdlLicense: "",
    cdlExpiry: "",
    medicalCardExpiry: "",
    insuranceExpiry: "",
  });

  useEffect(() => {
    if (driver) {
      setFormData({
        name: driver.name || "",
        email: driver.email || "",
        location: driver.location || "",
        vehicleType: driver.vehicleType || "Dry Van",
        availability: driver.availability || "Available",
        profileSummary: driver.profileSummary || "",
        cdlLicense: driver.cdlLicense || "",
        cdlExpiry: driver.cdlExpiry?.split("T")[0] || "",
        medicalCardExpiry: driver.medicalCardExpiry?.split("T")[0] || "",
        insuranceExpiry: driver.insuranceExpiry?.split("T")[0] || "",
      });
    }
  }, [driver]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driver || !firestore || !auth.currentUser) return;

    setIsLoading(true);
    try {
      const driverRef = doc(firestore, `owner_operators/${auth.currentUser.uid}/drivers/${driver.id}`);
      
      await updateDoc(driverRef, {
        name: formData.name,
        email: formData.email,
        location: formData.location,
        vehicleType: formData.vehicleType,
        availability: formData.availability,
        profileSummary: formData.profileSummary,
        cdlLicense: formData.cdlLicense,
        cdlExpiry: formData.cdlExpiry || null,
        medicalCardExpiry: formData.medicalCardExpiry || null,
        insuranceExpiry: formData.insuranceExpiry || null,
      });

      showSuccess("Driver updated successfully");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      showError(error.message || "Failed to update driver");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-headline">Edit Driver</DialogTitle>
          <DialogDescription>
            Update the driver's information below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-location">Location</Label>
            <Input
              id="edit-location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Miami, FL"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vehicle Type</Label>
              <Select
                value={formData.vehicleType}
                onValueChange={(value: "Dry Van" | "Reefer" | "Flatbed") =>
                  setFormData({ ...formData, vehicleType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dry Van">Dry Van</SelectItem>
                  <SelectItem value="Reefer">Reefer</SelectItem>
                  <SelectItem value="Flatbed">Flatbed</SelectItem>
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
            <Label htmlFor="edit-cdl">CDL License #</Label>
            <Input
              id="edit-cdl"
              value={formData.cdlLicense}
              onChange={(e) => setFormData({ ...formData, cdlLicense: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-cdl-expiry">CDL Expiry</Label>
              <Input
                id="edit-cdl-expiry"
                type="date"
                value={formData.cdlExpiry}
                onChange={(e) => setFormData({ ...formData, cdlExpiry: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-medical-expiry">Medical Card</Label>
              <Input
                id="edit-medical-expiry"
                type="date"
                value={formData.medicalCardExpiry}
                onChange={(e) => setFormData({ ...formData, medicalCardExpiry: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-insurance-expiry">Insurance</Label>
              <Input
                id="edit-insurance-expiry"
                type="date"
                value={formData.insuranceExpiry}
                onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-summary">Profile Summary</Label>
            <Textarea
              id="edit-summary"
              value={formData.profileSummary}
              onChange={(e) => setFormData({ ...formData, profileSummary: e.target.value })}
              placeholder="Brief description of experience and specializations..."
            />
          </div>

          <DialogFooter>
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
