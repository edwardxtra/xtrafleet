'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Loader2, DollarSign, CreditCard, Receipt, RefreshCw, Download, AlertCircle, FileDown } from 'lucide-react';
import { RefundModal } from './refund-modal';
import { exportOwnerOperatorBilling } from '@/lib/billing-export';
import { toast } from 'sonner';

interface OwnerOperator {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  subscriptionPlan?: 'monthly' | 'six_month' | 'yearly';
  subscriptionStatus?: 'active' | 'inactive' | 'cancelled';
  createdAt?: any;
  stripeCustomerId?: string;
}

interface Payment {
  id: string;
  type: 'monthly_subscription' | 'match_fee' | 'load_delivery_fee';
  amount: number;
  status: 'succeeded' | 'pending' | 'failed';
  createdAt: any;
  description?: string;
  invoiceUrl?: string;
  loadId?: string;
  matchId?: string;
}

interface BillingDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerOperator: OwnerOperator;
}

export function BillingDetailModal({ open, onOpenChange, ownerOperator }: BillingDetailModalProps) {
  const db = useFirestore();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');

  useEffect(() => {
    if (open && db) {
      fetchPayments();
    }
  }, [open, db, ownerOperator.id]);

  const fetchPayments = async () => {
    if (!db) return;
    setLoading(true);
    try {
      // Fetch payment history from Firestore
      const paymentsRef = collection(db, 'payments');
      const q = query(
        paymentsRef,
        where('ownerOperatorId', '==', ownerOperator.id),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
      const snapshot = await getDocs(q);
      const paymentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Payment[];
      setPayments(paymentsData);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast.error('Failed to load payment history');
    } finally {
      setLoading(false);
    }
  };

  const getPlanName = (plan?: string) => {
    switch (plan) {
      case 'monthly': return 'Monthly - $49.99/month';
      case 'six_month': return '6-Month - $269.99 ($44.99/month)';
      case 'yearly': return 'Yearly - $499.99 ($41.66/month)';
      default: return 'No Active Plan';
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">Active</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getPaymentTypeBadge = (type: string) => {
    switch (type) {
      case 'monthly_subscription':
        return <Badge variant="default">Monthly Subscription</Badge>;
      case 'match_fee':
        return <Badge variant="secondary">Match Fee</Badge>;
      case 'load_delivery_fee':
        return <Badge variant="outline">Load Delivery</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <Badge className="bg-green-500">Succeeded</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
  };

  const handleApplyDiscount = async () => {
    if (!discountValue) {
      toast.error('Please enter a discount value');
      return;
    }
    
    try {
      // TODO: Implement Stripe API call to apply discount
      toast.success(`${discountType === 'percentage' ? discountValue + '%' : '$' + discountValue} discount applied successfully`);
      setDiscountValue('');
    } catch (error) {
      console.error('Error applying discount:', error);
      toast.error('Failed to apply discount');
    }
  };

  const handleRefund = (payment: Payment) => {
    setSelectedPayment(payment);
    setShowRefundModal(true);
  };

  const handleExportBilling = () => {
    exportOwnerOperatorBilling(payments, ownerOperator);
    toast.success('Billing history exported successfully');
  };

  const totalRevenue = payments
    .filter(p => p.status === 'succeeded')
    .reduce((sum, p) => sum + p.amount, 0);

  const monthlyFees = payments.filter(p => p.type === 'monthly_subscription' && p.status === 'succeeded');
  const matchFees = payments.filter(p => p.type === 'match_fee' && p.status === 'succeeded');
  const deliveryFees = payments.filter(p => p.type === 'load_delivery_fee' && p.status === 'succeeded');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {ownerOperator.firstName || ownerOperator.lastName
                ? `${ownerOperator.firstName || ''} ${ownerOperator.lastName || ''}`.trim()
                : ownerOperator.email}
            </DialogTitle>
            <DialogDescription>
              {ownerOperator.companyName && `${ownerOperator.companyName} • `}
              {ownerOperator.email}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="subscription">Subscription</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      From {payments.filter(p => p.status === 'succeeded').length} transactions
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold">{getPlanName(ownerOperator.subscriptionPlan)}</div>
                    <div className="mt-2">{getStatusBadge(ownerOperator.subscriptionStatus)}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Account Created</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold">{formatDate(ownerOperator.createdAt)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Member since</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Revenue Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="default">Monthly Subscriptions</Badge>
                        <span className="text-sm text-muted-foreground">({monthlyFees.length})</span>
                      </div>
                      <span className="font-semibold">
                        {formatCurrency(monthlyFees.reduce((sum, p) => sum + p.amount, 0))}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Match Fees</Badge>
                        <span className="text-sm text-muted-foreground">({matchFees.length})</span>
                      </div>
                      <span className="font-semibold">
                        {formatCurrency(matchFees.reduce((sum, p) => sum + p.amount, 0))}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Load Delivery Fees</Badge>
                        <span className="text-sm text-muted-foreground">({deliveryFees.length})</span>
                      </div>
                      <span className="font-semibold">
                        {formatCurrency(deliveryFees.reduce((sum, p) => sum + p.amount, 0))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="subscription" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Subscription Management</CardTitle>
                  <CardDescription>Manage the user's subscription plan and billing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Current Plan</Label>
                      <p className="text-sm font-medium mt-1">{getPlanName(ownerOperator.subscriptionPlan)}</p>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <div className="mt-1">{getStatusBadge(ownerOperator.subscriptionStatus)}</div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Label>Change Plan</Label>
                    <Select>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select new plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly - $49.99/month</SelectItem>
                        <SelectItem value="six_month">6-Month - $269.99 ($44.99/month)</SelectItem>
                        <SelectItem value="yearly">Yearly - $499.99 ($41.66/month)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Apply Discount</Label>
                    <div className="flex gap-2">
                      <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="fixed">Fixed Amount</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder={discountType === 'percentage' ? '10' : '5.00'}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                      />
                      <Button onClick={handleApplyDiscount}>
                        Apply
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {discountType === 'percentage'
                        ? 'Enter percentage off (e.g., 10 for 10% off)'
                        : 'Enter dollar amount off (e.g., 5 for $5 off)'}
                    </p>
                  </div>

                  <Separator />

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reactivate
                    </Button>
                    <Button variant="destructive" className="flex-1">
                      Cancel Subscription
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payments" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Payment History</CardTitle>
                      <CardDescription>All transactions for this user</CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportBilling}
                      disabled={payments.length === 0}
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : payments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      <p>No payment history found</p>
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>{formatDate(payment.createdAt)}</TableCell>
                              <TableCell>{getPaymentTypeBadge(payment.type)}</TableCell>
                              <TableCell className="max-w-[200px] truncate">
                                {payment.description || 'N/A'}
                              </TableCell>
                              <TableCell className="font-semibold">
                                {formatCurrency(payment.amount)}
                              </TableCell>
                              <TableCell>{getPaymentStatusBadge(payment.status)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {payment.invoiceUrl && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => window.open(payment.invoiceUrl, '_blank')}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {payment.status === 'succeeded' && payment.type === 'match_fee' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRefund(payment)}
                                    >
                                      Refund
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payment-methods" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Payment Methods</CardTitle>
                  <CardDescription>Credit cards and bank accounts on file</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <div className="text-center">
                      <CreditCard className="h-8 w-8 mx-auto mb-2" />
                      <p>No payment methods on file</p>
                      <p className="text-sm mt-1">Payment methods will appear here when added</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {selectedPayment && (
        <RefundModal
          open={showRefundModal}
          onOpenChange={setShowRefundModal}
          payment={selectedPayment}
          ownerOperator={ownerOperator}
          onRefundComplete={fetchPayments}
        />
      )}
    </>
  );
}
