"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  CreditCard, 
  DollarSign, 
  AlertCircle, 
  Check,
  X,
  RefreshCw,
  Tag,
  Calendar,
  Mail,
  Building
} from "lucide-react";
import Link from "next/link";
import { useUser } from "@/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CustomerData {
  id: string;
  email: string;
  companyName: string;
  subscriptionStatus: string;
  subscriptionPlan: string;
  stripeCustomerId: string | null;
  paymentMethodLast4: string | null;
  nextBillingDate: string | null;
  trialEndsAt: string | null;
  discountCode: string | null;
  discountAmount: number | null;
}

export default function CustomerBillingPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const customerId = params.customerId as string;

  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Discount dialog state
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [discountDuration, setDiscountDuration] = useState<'once' | 'forever' | 'repeating'>('forever');

  // Refund dialog state
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  // Status update dialog
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  useEffect(() => {
    fetchCustomer();
  }, [customerId]);

  const fetchCustomer = async () => {
    try {
      setIsLoading(true);
      const customerRef = doc(db, "owner_operators", customerId);
      const customerSnap = await getDoc(customerRef);

      if (customerSnap.exists()) {
        const data = customerSnap.data();
        setCustomer({
          id: customerSnap.id,
          email: data.email || 'N/A',
          companyName: data.companyName || 'Unknown Company',
          subscriptionStatus: data.subscriptionStatus || 'none',
          subscriptionPlan: data.subscriptionPlan || 'Free Trial',
          stripeCustomerId: data.stripeCustomerId || null,
          paymentMethodLast4: data.paymentMethodLast4 || null,
          nextBillingDate: data.nextBillingDate || null,
          trialEndsAt: data.trialEndsAt || null,
          discountCode: data.discountCode || null,
          discountAmount: data.discountAmount || null,
        });
      }
    } catch (error) {
      console.error("Error fetching customer:", error);
      toast({
        title: "Error",
        description: "Failed to load customer data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyDiscount = async () => {
    if (!customer || !discountValue) return;

    try {
      setIsUpdating(true);

      const customerRef = doc(db, "owner_operators", customerId);
      await updateDoc(customerRef, {
        discountCode: `ADMIN_${discountType.toUpperCase()}_${discountValue}`,
        discountAmount: parseFloat(discountValue),
        discountType: discountType,
        discountDuration: discountDuration,
        updatedAt: new Date().toISOString(),
      });

      toast({
        title: "Success",
        description: "Discount applied successfully",
      });

      setShowDiscountDialog(false);
      fetchCustomer();
    } catch (error) {
      console.error("Error applying discount:", error);
      toast({
        title: "Error",
        description: "Failed to apply discount",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveDiscount = async () => {
    if (!customer) return;

    try {
      setIsUpdating(true);

      const customerRef = doc(db, "owner_operators", customerId);
      await updateDoc(customerRef, {
        discountCode: null,
        discountAmount: null,
        discountType: null,
        discountDuration: null,
        updatedAt: new Date().toISOString(),
      });

      toast({
        title: "Success",
        description: "Discount removed successfully",
      });

      fetchCustomer();
    } catch (error) {
      console.error("Error removing discount:", error);
      toast({
        title: "Error",
        description: "Failed to remove discount",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!customer || !newStatus) return;

    try {
      setIsUpdating(true);

      const customerRef = doc(db, "owner_operators", customerId);
      await updateDoc(customerRef, {
        subscriptionStatus: newStatus,
        updatedAt: new Date().toISOString(),
      });

      toast({
        title: "Success",
        description: "Subscription status updated",
      });

      setShowStatusDialog(false);
      fetchCustomer();
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemovePaymentMethod = async () => {
    if (!customer) return;

    try {
      setIsUpdating(true);

      const customerRef = doc(db, "owner_operators", customerId);
      await updateDoc(customerRef, {
        paymentMethodLast4: null,
        stripePaymentMethodId: null,
        updatedAt: new Date().toISOString(),
      });

      toast({
        title: "Success",
        description: "Payment method removed",
      });

      fetchCustomer();
    } catch (error) {
      console.error("Error removing payment method:", error);
      toast({
        title: "Error",
        description: "Failed to remove payment method",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
      trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
      past_due: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
      canceled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100",
      none: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100",
    };

    return (
      <Badge className={styles[status as keyof typeof styles] || styles.none}>
        {status === 'none' ? 'No Subscription' : status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  // Check if user is admin
  const isAdmin = user?.email === 'edward@xtrafleet.com';

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Customer not found
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link href="/dashboard/admin/billing">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Customers
            </Link>
          </Button>
          <h1 className="text-3xl font-bold font-headline">{customer.companyName}</h1>
          <p className="text-muted-foreground">{customer.email}</p>
        </div>
        <div>
          {getStatusBadge(customer.subscriptionStatus)}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Customer Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Company Name</Label>
              <p className="font-medium">{customer.companyName}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Email</Label>
              <p className="font-medium">{customer.email}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Customer ID</Label>
              <p className="font-mono text-sm">{customer.id}</p>
            </div>
            {customer.stripeCustomerId && (
              <div>
                <Label className="text-muted-foreground">Stripe Customer ID</Label>
                <p className="font-mono text-sm">{customer.stripeCustomerId}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Subscription Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="flex items-center gap-2 mt-1">
                {getStatusBadge(customer.subscriptionStatus)}
                <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      Update
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Update Subscription Status</DialogTitle>
                      <DialogDescription>
                        Change the subscription status for this customer
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>New Status</Label>
                        <Select value={newStatus} onValueChange={setNewStatus}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="trialing">Trialing</SelectItem>
                            <SelectItem value="past_due">Past Due</SelectItem>
                            <SelectItem value="canceled">Canceled</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleUpdateStatus} disabled={isUpdating}>
                        {isUpdating ? 'Updating...' : 'Update Status'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Plan</Label>
              <p className="font-medium">{customer.subscriptionPlan}</p>
            </div>
            {customer.nextBillingDate && (
              <div>
                <Label className="text-muted-foreground">Next Billing Date</Label>
                <p className="font-medium">
                  {new Date(customer.nextBillingDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            )}
            {customer.trialEndsAt && (
              <div>
                <Label className="text-muted-foreground">Trial Ends</Label>
                <p className="font-medium">
                  {new Date(customer.trialEndsAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Method
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customer.paymentMethodLast4 ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-muted-foreground">Card</Label>
                    <p className="font-medium">•••• •••• •••• {customer.paymentMethodLast4}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemovePaymentMethod}
                    disabled={isUpdating}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                </div>
              </>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No payment method on file
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-sm text-muted-foreground">
              Customer can update their payment method in their account settings
            </p>
          </CardFooter>
        </Card>

        {/* Discounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Discounts & Coupons
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customer.discountCode ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-muted-foreground">Active Discount</Label>
                    <p className="font-medium">{customer.discountCode}</p>
                    {customer.discountAmount && (
                      <p className="text-sm text-muted-foreground">
                        ${customer.discountAmount} off
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveDiscount}
                    disabled={isUpdating}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active discounts</p>
            )}
          </CardContent>
          <CardFooter>
            <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Tag className="h-4 w-4 mr-2" />
                  Apply Discount
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Apply Discount</DialogTitle>
                  <DialogDescription>
                    Apply a custom discount to this customer's subscription
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Discount Type</Label>
                    <Select value={discountType} onValueChange={(value: 'percentage' | 'fixed') => setDiscountType(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage Off</SelectItem>
                        <SelectItem value="fixed">Fixed Amount Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Discount Value</Label>
                    <Input
                      type="number"
                      placeholder={discountType === 'percentage' ? 'e.g., 10 (for 10%)' : 'e.g., 5.00'}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Duration</Label>
                    <Select value={discountDuration} onValueChange={(value: 'once' | 'forever' | 'repeating') => setDiscountDuration(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">One-time</SelectItem>
                        <SelectItem value="forever">Forever</SelectItem>
                        <SelectItem value="repeating">Repeating (6 months)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDiscountDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleApplyDiscount} disabled={isUpdating || !discountValue}>
                    {isUpdating ? 'Applying...' : 'Apply Discount'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardFooter>
        </Card>
      </div>

      {/* Action Buttons */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common billing and subscription management actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="w-full" disabled>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Payment
            </Button>
            <Button variant="outline" className="w-full" disabled>
              <DollarSign className="h-4 w-4 mr-2" />
              Issue Refund
            </Button>
            <Button variant="outline" className="w-full" disabled>
              <Mail className="h-4 w-4 mr-2" />
              Send Invoice
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Advanced actions (retry payment, refunds) require Stripe API integration
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
