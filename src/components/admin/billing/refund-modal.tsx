'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface Payment {
  id: string;
  type: string;
  amount: number;
  status: string;
  description?: string;
}

interface OwnerOperator {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
}

interface RefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment;
  ownerOperator: OwnerOperator;
  onRefundComplete?: () => void;
}

export function RefundModal({
  open,
  onOpenChange,
  payment,
  ownerOperator,
  onRefundComplete,
}: RefundModalProps) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
  };

  const handleRefund = async () => {
    if (!reason) {
      toast.error('Please select a refund reason');
      return;
    }

    if (!details.trim()) {
      toast.error('Please provide details for the refund');
      return;
    }

    setIsProcessing(true);

    try {
      // TODO: Call Stripe API to process refund
      const response = await fetch('/api/stripe/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: payment.id,
          reason,
          details,
          ownerOperatorId: ownerOperator.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Refund failed');
      }

      toast.success(`Refund of ${formatCurrency(payment.amount)} processed successfully`);
      onOpenChange(false);
      if (onRefundComplete) onRefundComplete();
    } catch (error) {
      console.error('Error processing refund:', error);
      toast.error('Failed to process refund. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Issue Refund</DialogTitle>
          <DialogDescription>
            Process a refund for {ownerOperator.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-yellow-900 mb-1">Refund Details</h4>
                <div className="space-y-1 text-sm text-yellow-800">
                  <p><strong>Amount:</strong> {formatCurrency(payment.amount)}</p>
                  <p><strong>Payment Type:</strong> {payment.type.replace('_', ' ')}</p>
                  <p><strong>Description:</strong> {payment.description || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Refund Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="technical_issue">Technical Issue</SelectItem>
                <SelectItem value="customer_satisfaction">Customer Satisfaction</SelectItem>
                <SelectItem value="duplicate_charge">Duplicate Charge</SelectItem>
                <SelectItem value="service_not_delivered">Service Not Delivered</SelectItem>
                <SelectItem value="requested_by_customer">Requested by Customer</SelectItem>
                <SelectItem value="admin_error">Admin Error</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">Additional Details *</Label>
            <Textarea
              id="details"
              placeholder="Provide detailed information about the reason for this refund..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              This information will be saved for audit purposes and may be visible to the customer.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRefund}
            disabled={isProcessing || !reason || !details.trim()}
          >
            {isProcessing ? (
              <>
                <span className="mr-2">Processing...</span>
              </>
            ) : (
              <>
                <DollarSign className="h-4 w-4 mr-2" />
                Process Refund
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
