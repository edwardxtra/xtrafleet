'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, DollarSign } from 'lucide-react';
import { BillingDetailModal } from '@/components/admin/billing/billing-detail-modal';

interface OwnerOperator {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  subscriptionPlan?: 'monthly' | 'six_month' | 'yearly';
  subscriptionStatus?: 'active' | 'inactive' | 'cancelled';
  createdAt?: any;
}

export default function AdminBillingPage() {
  const db = useFirestore();
  const [ownerOperators, setOwnerOperators] = useState<OwnerOperator[]>([]);
  const [filteredOOs, setFilteredOOs] = useState<OwnerOperator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOO, setSelectedOO] = useState<OwnerOperator | null>(null);
  const [showBillingModal, setShowBillingModal] = useState(false);

  useEffect(() => {
    async function fetchOwnerOperators() {
      if (!db) return;
      try {
        const q = query(collection(db, 'owner_operators'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const oos = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as OwnerOperator[];
        setOwnerOperators(oos);
        setFilteredOOs(oos);
      } catch (error) {
        console.error('Error fetching owner operators:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchOwnerOperators();
  }, [db]);

  useEffect(() => {
    const filtered = ownerOperators.filter(oo => {
      const searchLower = searchTerm.toLowerCase();
      return (
        oo.email?.toLowerCase().includes(searchLower) ||
        oo.firstName?.toLowerCase().includes(searchLower) ||
        oo.lastName?.toLowerCase().includes(searchLower) ||
        oo.companyName?.toLowerCase().includes(searchLower)
      );
    });
    setFilteredOOs(filtered);
  }, [searchTerm, ownerOperators]);

  const getPlanBadge = (plan?: string) => {
    switch (plan) {
      case 'monthly':
        return <Badge variant="default">Monthly - $49.99</Badge>;
      case 'six_month':
        return <Badge variant="secondary">6-Month - $269.99</Badge>;
      case 'yearly':
        return <Badge variant="outline">Yearly - $499.99</Badge>;
      default:
        return <Badge variant="destructive">No Plan</Badge>;
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

  const handleRowClick = (oo: OwnerOperator) => {
    setSelectedOO(oo);
    setShowBillingModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users & Billing</h1>
          <p className="text-muted-foreground">Manage all owner-operator billing and subscriptions</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Owner Operators</CardTitle>
            <CardDescription>
              View and manage billing information for all users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOOs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No owner operators found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOOs.map((oo) => (
                      <TableRow
                        key={oo.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(oo)}
                      >
                        <TableCell className="font-medium">
                          {oo.firstName || oo.lastName
                            ? `${oo.firstName || ''} ${oo.lastName || ''}`.trim()
                            : 'N/A'}
                        </TableCell>
                        <TableCell>{oo.companyName || 'N/A'}</TableCell>
                        <TableCell>{oo.email}</TableCell>
                        <TableCell>{getPlanBadge(oo.subscriptionPlan)}</TableCell>
                        <TableCell>{getStatusBadge(oo.subscriptionStatus)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(oo);
                            }}
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            View Billing
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedOO && (
        <BillingDetailModal
          open={showBillingModal}
          onOpenChange={setShowBillingModal}
          ownerOperator={selectedOO}
        />
      )}
    </>
  );
}
