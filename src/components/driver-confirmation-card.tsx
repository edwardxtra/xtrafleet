"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DriverData {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  dateOfBirth?: string;
  cdlNumber?: string;
  cdlState?: string;
  cdlClass?: string;
  endorsements?: string[];
  medicalCertExpiration?: string;
  profileStatus?: string;
}

interface DriverConfirmationCardProps {
  driver: DriverData;
  onConfirmed?: () => void;
}

export function DriverConfirmationCard({ driver, onConfirmed }: DriverConfirmationCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async (confirmed: boolean) => {
    if (confirmed && !hasConfirmed) {
      toast({
        title: "Confirmation Required",
        description: "Please check the confirmation box to proceed.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/confirm-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: driver.id,
          confirmed,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to confirm driver');
      }

      toast({
        title: confirmed ? "Driver Confirmed! ✅" : "Driver Rejected",
        description: confirmed 
          ? "Driver is now eligible for leasing." 
          : "Driver profile has been rejected.",
      });

      if (onConfirmed) onConfirmed();

    } catch (error: any) {
      toast({
        title: "Action Failed",
        description: error?.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayName = driver.firstName && driver.lastName 
    ? `${driver.firstName} ${driver.lastName}`
    : driver.name || 'Driver';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm Driver: {displayName}</CardTitle>
        <CardDescription>
          Review the driver's information and confirm accuracy before enabling for leasing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertDescription className="text-sm">
            <strong>⏳ Pending Fleet Attestation:</strong> This driver has submitted their profile and is awaiting your confirmation.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <h4 className="font-semibold">Driver Information</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Date of Birth</p>
              <p className="font-medium">{driver.dateOfBirth || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">CDL Number</p>
              <p className="font-medium">{driver.cdlNumber || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">CDL State</p>
              <p className="font-medium">{driver.cdlState || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">CDL Class</p>
              <p className="font-medium">Class {driver.cdlClass || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Endorsements</p>
              <p className="font-medium">
                {driver.endorsements && driver.endorsements.length > 0 
                  ? driver.endorsements.join(', ')
                  : 'None'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Medical Cert Expiration</p>
              <p className="font-medium">{driver.medicalCertExpiration || 'Not provided'}</p>
            </div>
          </div>
        </div>

        <div className="border-t pt-6 space-y-4">
          <div className="flex items-start space-x-3 border rounded-md p-4 bg-muted/50">
            <Checkbox 
              id="confirm-accuracy"
              checked={hasConfirmed}
              onCheckedChange={(checked) => setHasConfirmed(checked as boolean)}
            />
            <div className="flex-1">
              <Label htmlFor="confirm-accuracy" className="text-sm font-medium cursor-pointer">
                We confirm that this driver's information is accurate and that we maintain a complete and current Driver Qualification File for this driver.
              </Label>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => handleConfirm(true)}
              disabled={isSubmitting || !hasConfirmed}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Driver
                </>
              )}
            </Button>
            <Button
              onClick={() => handleConfirm(false)}
              disabled={isSubmitting}
              variant="destructive"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
