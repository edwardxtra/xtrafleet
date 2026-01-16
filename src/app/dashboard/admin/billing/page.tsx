"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, CreditCard, DollarSign, Users, TrendingUp, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore } from "@/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

interface CustomerBilling {
  id: string;
  email: string;
  companyName: string;
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  plan: string;
  mrr: number;
  nextBillingDate: string | null;
  paymentMethod: string | null;
  trialEndsAt: string | null;
}

export default function AdminBillingPage() {
  const { user } = useUser();
  const db = useFirestore();
  const [customers, setCustomers] = useState<CustomerBilling[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerBilling[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Revenue metrics
  const totalMRR = customers.reduce((sum, c) => sum + c.mrr, 0);
  const activeCustomers = customers.filter(c => c.subscriptionStatus === 'active').length;
  const trialingCustomers = customers.filter(c => c.subscriptionStatus === 'trialing').length;
  const pastDueCustomers = customers.filter(c => c.subscriptionStatus === 'past_due').length;

  useEffect(() => {
    if (db) {
      fetchCustomers();
    }
  }, [db]);

  useEffect(() => {
    filterCustomers();
  }, [searchQuery, statusFilter, customers]);

  const fetchCustomers = async () => {
    if (!db) return;
    
    try {
      setIsLoading(true);
      
      // Fetch all owner-operators
      const ownersRef = collection(db, "owner_operators");
      const ownersSnap = await getDocs(ownersRef);
      
      const customerData: CustomerBilling[] = ownersSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          email: data.email || 'N/A',
          companyName: data.companyName || 'Unknown Company',
          subscriptionStatus: data.subscriptionStatus || 'none',
          plan: data.subscriptionPlan || 'Free Trial',
          mrr: data.subscriptionStatus === 'active' ? 49.99 : 0,
          nextBillingDate: data.nextBillingDate || null,
          paymentMethod: data.paymentMethodLast4 ? `•••• ${data.paymentMethodLast4}` : null,
          trialEndsAt: data.trialEndsAt || null,
        };
      });

      setCustomers(customerData);
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterCustomers = () => {
    let filtered = customers;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(c => 
        c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.companyName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(c => c.subscriptionStatus === statusFilter);
    }

    setFilteredCustomers(filtered);
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
  // TODO: Add proper admin role check
  const isAdmin = user?.email === 'edward@xtrafleet.com'; // Temporary

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-headline">Billing & Subscriptions</h1>
        <p className="text-muted-foreground mt-1">
          Manage customer subscriptions, payment methods, and billing
        </p>
      </div>

      {/* Revenue Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalMRR.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Monthly Recurring Revenue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCustomers}</div>
            <p className="text-xs text-muted-foreground">
              Paying subscribers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trialing</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trialingCustomers}</div>
            <p className="text-xs text-muted-foreground">
              In free trial
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Past Due</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{pastDueCustomers}</div>
            <p className="text-xs text-muted-foreground">
              Needs attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>
            Search and filter customer subscriptions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email or company name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                onClick={() => setStatusFilter("all")}
              >
                All
              </Button>
              <Button
                variant={statusFilter === "active" ? "default" : "outline"}
                onClick={() => setStatusFilter("active")}
              >
                Active
              </Button>
              <Button
                variant={statusFilter === "trialing" ? "default" : "outline"}
                onClick={() => setStatusFilter("trialing")}
              >
                Trial
              </Button>
              <Button
                variant={statusFilter === "past_due" ? "default" : "outline"}
                onClick={() => setStatusFilter("past_due")}
              >
                Past Due
              </Button>
            </div>
          </div>

          {/* Customer Table */}
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>MRR</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Next Billing</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No customers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">
                          {customer.companyName}
                        </TableCell>
                        <TableCell>{customer.email}</TableCell>
                        <TableCell>{getStatusBadge(customer.subscriptionStatus)}</TableCell>
                        <TableCell>{customer.plan}</TableCell>
                        <TableCell>
                          {customer.mrr > 0 ? `$${customer.mrr.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell>
                          {customer.paymentMethod || (
                            <span className="text-muted-foreground">No card</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {customer.nextBillingDate ? (
                            new Date(customer.nextBillingDate).toLocaleDateString()
                          ) : customer.trialEndsAt ? (
                            <span className="text-sm">
                              Trial: {new Date(customer.trialEndsAt).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            asChild
                          >
                            <Link href={`/admin/billing/${customer.id}`}>
                              Manage
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
