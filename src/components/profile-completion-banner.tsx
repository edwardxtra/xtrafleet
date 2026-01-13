"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  X,
  FileText,
  Shield,
  Truck
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ProfileCompletionBannerProps {
  driver: {
    cdlLicense?: string;
    cdlExpiry?: string;
    medicalCardExpiry?: string;
    insuranceExpiry?: string;
    motorVehicleRecordNumber?: string;
    backgroundCheckDate?: string;
    preEmploymentScreeningDate?: string;
    drugAndAlcoholScreeningDate?: string;
    cdlDocumentUrl?: string;
    medicalCardUrl?: string;
    insuranceUrl?: string;
    mvrUrl?: string;
    backgroundCheckUrl?: string;
    preEmploymentScreeningUrl?: string;
    drugAndAlcoholScreeningUrl?: string;
  };
  driverId: string;
}

export function ProfileCompletionBanner({ driver, driverId }: ProfileCompletionBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  // Calculate completion
  const criticalItems = [
    { name: "CDL Number", completed: !!driver.cdlLicense, icon: FileText },
    { name: "CDL Expiry", completed: !!driver.cdlExpiry, icon: FileText },
  ];

  const complianceItems = [
    { name: "Medical Card", completed: !!driver.medicalCardExpiry, icon: Shield },
    { name: "Insurance", completed: !!driver.insuranceExpiry, icon: Shield },
    { name: "MVR Number", completed: !!driver.motorVehicleRecordNumber, icon: Truck },
    { name: "Background Check", completed: !!driver.backgroundCheckDate, icon: Shield },
    { name: "Pre-Employment Screening", completed: !!driver.preEmploymentScreeningDate, icon: Shield },
    { name: "Drug & Alcohol Screening", completed: !!driver.drugAndAlcoholScreeningDate, icon: Shield },
  ];

  const allItems = [...criticalItems, ...complianceItems];
  const completedCount = allItems.filter(item => item.completed).length;
  const totalCount = allItems.length;
  const completionPercent = Math.round((completedCount / totalCount) * 100);

  const criticalComplete = criticalItems.every(item => item.completed);
  const allComplete = allItems.every(item => item.completed);

  // Don't show if dismissed or 100% complete
  if (isDismissed || allComplete) return null;

  return (
    <Alert className={`mb-6 ${!criticalComplete ? 'border-amber-500 bg-amber-50' : 'border-blue-500 bg-blue-50'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {!criticalComplete ? (
              <>
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <h3 className="font-semibold text-amber-900">Complete Your Profile to Start Receiving Loads</h3>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">
                  You're {completionPercent}% Complete! Finish your compliance documents.
                </h3>
              </>
            )}
          </div>

          <AlertDescription className="text-sm mb-4">
            {!criticalComplete ? (
              <span className="text-amber-800">
                Add your CDL information to start matching with loads. You can upload documents anytime.
              </span>
            ) : (
              <span className="text-blue-800">
                Great start! Complete your compliance documents to unlock full platform access.
              </span>
            )}
          </AlertDescription>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">
                {completedCount} of {totalCount} items complete
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {completionPercent}%
              </span>
            </div>
            <Progress value={completionPercent} className="h-2" />
          </div>

          {/* Items List */}
          <div className="space-y-3 mb-4">
            {/* Critical Items */}
            {!criticalComplete && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Required to Match</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {criticalItems.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 text-sm">
                      {item.completed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={item.completed ? "text-muted-foreground line-through" : ""}>
                        {item.name}
                      </span>
                      {item.completed && <Badge variant="secondary" className="text-xs">Done</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compliance Items (only show if critical is complete) */}
            {criticalComplete && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Compliance Documents</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {complianceItems.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 text-sm">
                      {item.completed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={item.completed ? "text-muted-foreground line-through" : ""}>
                        {item.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          <Link href={`/dashboard/drivers/${driverId}`}>
            <Button size="sm" variant={criticalComplete ? "default" : "accent"}>
              {criticalComplete ? "Complete My Profile" : "Add CDL Information →"}
            </Button>
          </Link>
        </div>

        {/* Dismiss Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Alert>
  );
}
