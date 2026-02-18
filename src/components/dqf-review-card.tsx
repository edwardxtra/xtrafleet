'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  FileText as FileTextIcon, 
  ExternalLink 
} from 'lucide-react';
import { format } from 'date-fns';
import { showSuccess, showError } from '@/lib/toast-utils';
import type { Driver } from '@/lib/data';

interface DQFReviewCardProps {
  driver: Driver;
  onRefresh?: () => void;
}

export function DQFReviewCard({ driver, onRefresh }: DQFReviewCardProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const response = await fetch('/api/approve-dqf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id, action: 'approve' }),
      });
      
      if (response.ok) {
        showSuccess('DQF approved successfully!');
        onRefresh?.();
      } else {
        throw new Error('Failed to approve');
      }
    } catch (error) {
      showError('Failed to approve DQF');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      const response = await fetch('/api/approve-dqf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id, action: 'reject' }),
      });
      
      if (response.ok) {
        showSuccess('DQF rejected');
        onRefresh?.();
      } else {
        throw new Error('Failed to reject');
      }
    } catch (error) {
      showError('Failed to reject DQF');
    } finally {
      setIsRejecting(false);
    }
  };

  // Only show for new hire drivers
  if (driver.driverType !== 'newHire') {
    return null;
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="font-headline">Driver Qualification File (DQF)</CardTitle>
        <CardDescription>
          {driver.dqfStatus === 'pending' && 'Waiting for driver to complete DQF'}
          {driver.dqfStatus === 'submitted' && 'Ready for your review and approval'}
          {driver.dqfStatus === 'approved' && 'DQF approved and complete'}
          {driver.dqfStatus === 'rejected' && 'DQF rejected - driver needs to resubmit'}
          {!driver.dqfStatus && 'DQF status unknown'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Submitted - Ready for Review */}
        {driver.dqfStatus === 'submitted' && driver.dqf && (
          <div className="space-y-4">
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-900 dark:text-amber-100">
                This driver has submitted their DQF. Please review all information carefully before approving.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-6">
              {/* Personal Information */}
              <div>
                <h4 className="font-semibold text-base mb-3">Personal Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm bg-muted/50 p-4 rounded-lg">
                  <div>
                    <span className="text-muted-foreground">Date of Birth:</span>
                    <p className="font-medium">{driver.dqf.personalInfo?.dob || 'Not provided'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Address:</span>
                    <p className="font-medium">
                      {driver.dqf.personalInfo?.address?.street || ''}<br />
                      {driver.dqf.personalInfo?.address?.city || ''}, {driver.dqf.personalInfo?.address?.state || ''} {driver.dqf.personalInfo?.address?.zip || ''}
                    </p>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              {/* Employment History */}
              {driver.dqf.employmentHistory && driver.dqf.employmentHistory.length > 0 && (
                <div>
                  <h4 className="font-semibold text-base mb-3">Employment History</h4>
                  <div className="space-y-3">
                    {driver.dqf.employmentHistory.map((emp: any, idx: number) => (
                      <div key={idx} className="text-sm p-4 bg-muted/50 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold">{emp.companyName}</p>
                            <p className="text-muted-foreground">{emp.position}</p>
                          </div>
                          <Badge variant="outline">{emp.startDate} to {emp.endDate}</Badge>
                        </div>
                        {emp.reasonForLeaving && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Reason for leaving: {emp.reasonForLeaving}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <Separator />
              
              {/* CDL Images */}
              <div>
                <h4 className="font-semibold text-base mb-3">CDL License Images</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {driver.dqf.cdlImages?.frontUrl && (
                    <a 
                      href={driver.dqf.cdlImages.frontUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <FileTextIcon className="h-5 w-5 text-blue-600" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">CDL Front</p>
                        <p className="text-xs text-muted-foreground">Click to view full image</p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </a>
                  )}
                  {driver.dqf.cdlImages?.backUrl && (
                    <a 
                      href={driver.dqf.cdlImages.backUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <FileTextIcon className="h-5 w-5 text-blue-600" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">CDL Back</p>
                        <p className="text-xs text-muted-foreground">Click to view full image</p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </a>
                  )}
                </div>
              </div>
              
              <Separator />
              
              {/* Accident History */}
              {driver.dqf.accidentHistory && (
                <div>
                  <h4 className="font-semibold text-base mb-3">Accident History (Last 3 Years)</h4>
                  {driver.dqf.accidentHistory.hasAccidents ? (
                    <div className="space-y-3">
                      {driver.dqf.accidentHistory.accidents?.map((acc: any, idx: number) => (
                        <div key={idx} className="text-sm p-4 bg-muted/50 rounded-lg">
                          <p><span className="text-muted-foreground">Date:</span> {acc.date}</p>
                          <p><span className="text-muted-foreground">Location:</span> {acc.location}</p>
                          {acc.description && <p className="mt-2">{acc.description}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground bg-green-50 dark:bg-green-950 p-3 rounded-lg border border-green-200 dark:border-green-800">
                      ✓ Driver certifies no accidents in the last 3 years
                    </p>
                  )}
                </div>
              )}
              
              <Separator />
              
              {/* Traffic Violations */}
              {driver.dqf.trafficViolations && (
                <div>
                  <h4 className="font-semibold text-base mb-3">Traffic Violations (Last 12 Months)</h4>
                  {driver.dqf.trafficViolations.hasViolations ? (
                    <div className="space-y-3">
                      {driver.dqf.trafficViolations.violations?.map((viol: any, idx: number) => (
                        <div key={idx} className="text-sm p-4 bg-muted/50 rounded-lg">
                          <p><span className="text-muted-foreground">Date:</span> {viol.date}</p>
                          <p><span className="text-muted-foreground">Violation:</span> {viol.violation}</p>
                          {viol.location && <p><span className="text-muted-foreground">Location:</span> {viol.location}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground bg-green-50 dark:bg-green-950 p-3 rounded-lg border border-green-200 dark:border-green-800">
                      ✓ Driver certifies no traffic violations in the last 12 months
                    </p>
                  )}
                </div>
              )}
            </div>
            
            {/* Approve/Reject Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button 
                onClick={handleApprove}
                disabled={isApproving || isRejecting}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {isApproving ? 'Approving...' : 'Approve DQF'}
              </Button>
              <Button 
                variant="destructive"
                onClick={handleReject}
                disabled={isApproving || isRejecting}
              >
                <XCircle className="h-4 w-4 mr-2" />
                {isRejecting ? 'Rejecting...' : 'Reject DQF'}
              </Button>
            </div>
          </div>
        )}
        
        {/* Pending Status */}
        {driver.dqfStatus === 'pending' && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Driver has not yet completed their DQF form. They will see a prompt to complete it when they log in.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Approved Status */}
        {driver.dqfStatus === 'approved' && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-900 dark:text-green-100">
              DQF approved on {driver.dqfApprovedAt && format(driver.dqfApprovedAt.toDate(), 'MMM dd, yyyy')}
            </AlertDescription>
          </Alert>
        )}
        
        {/* Rejected Status */}
        {driver.dqfStatus === 'rejected' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              DQF was rejected. Driver needs to resubmit with corrections.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
