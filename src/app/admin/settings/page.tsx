'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFirestore, useUser } from '@/firebase';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { Shield, ShieldOff, RefreshCw, UserPlus, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { OwnerOperator } from '@/lib/data';
import { logAuditAction } from '@/lib/audit';
import { showSuccess, showError } from '@/lib/toast-utils';

type AdminUser = OwnerOperator & {
  isAdmin?: boolean;
};

export default function AdminSettingsPage() {
  const firestore = useFirestore();
  const { user: currentAdmin } = useUser();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState<AdminUser | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [grantingUser, setGrantingUser] = useState<AdminUser | null>(null);
  const [revokingUser, setRevokingUser] = useState<AdminUser | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchAdmins = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const usersSnap = await getDocs(collection(firestore, 'owner_operators'));
      const usersData = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AdminUser[];
      setAllUsers(usersData);
      setAdmins(usersData.filter(u => u.isAdmin === true));
    } catch (error) {
      console.error('Error fetching admins:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAdmins(); }, [firestore]);

  const handleSearch = async () => {
    if (!firestore || !searchEmail.trim()) return;
    setIsSearching(true);
    setSearchResult(null);
    
    try {
      // Search in already fetched users
      const found = allUsers.find(u => 
        u.contactEmail?.toLowerCase() === searchEmail.toLowerCase().trim()
      );
      
      if (found) {
        setSearchResult(found);
      } else {
        showError('No user found with that email');
      }
    } catch (error) {
      console.error('Error searching:', error);
      showError('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleGrantAdmin = async () => {
    if (!firestore || !grantingUser || !currentAdmin) return;
    setIsProcessing(true);
    
    try {
      await updateDoc(doc(firestore, 'owner_operators', grantingUser.id), {
        isAdmin: true,
        adminGrantedAt: new Date().toISOString(),
        adminGrantedBy: currentAdmin.uid,
      });

      await logAuditAction(firestore, {
        action: 'user_updated',
        adminId: currentAdmin.uid,
        adminEmail: currentAdmin.email || '',
        targetType: 'user',
        targetId: grantingUser.id,
        targetName: grantingUser.companyName || grantingUser.contactEmail || '',
        reason: 'Granted admin console access',
        details: { action: 'grant_admin' },
      });

      showSuccess('Admin access granted');
      setGrantingUser(null);
      setSearchResult(null);
      setSearchEmail('');
      fetchAdmins();
    } catch (error: any) {
      showError(error.message || 'Failed to grant admin access');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevokeAdmin = async () => {
    if (!firestore || !revokingUser || !currentAdmin) return;
    
    // Prevent revoking own access
    if (revokingUser.id === currentAdmin.uid) {
      showError('You cannot revoke your own admin access');
      setRevokingUser(null);
      return;
    }
    
    setIsProcessing(true);
    
    try {
      await updateDoc(doc(firestore, 'owner_operators', revokingUser.id), {
        isAdmin: false,
        adminRevokedAt: new Date().toISOString(),
        adminRevokedBy: currentAdmin.uid,
      });

      await logAuditAction(firestore, {
        action: 'user_updated',
        adminId: currentAdmin.uid,
        adminEmail: currentAdmin.email || '',
        targetType: 'user',
        targetId: revokingUser.id,
        targetName: revokingUser.companyName || revokingUser.contactEmail || '',
        reason: 'Revoked admin console access',
        details: { action: 'revoke_admin' },
      });

      showSuccess('Admin access revoked');
      setRevokingUser(null);
      fetchAdmins();
    } catch (error: any) {
      showError(error.message || 'Failed to revoke admin access');
    } finally {
      setIsProcessing(false);
    }
  };

  const TableSkeleton = () => (
    <>{[1,2,3].map(i => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-8 w-20" /></TableCell>
      </TableRow>
    ))}</>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline">Admin Access</h1>
          <p className="text-muted-foreground">Manage console access for Operations & CS team</p>
        </div>
        <Button variant="outline" onClick={fetchAdmins} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />Refresh
        </Button>
      </div>

      {/* Warning Banner */}
      <Card className="border-yellow-300 bg-yellow-50">
        <CardContent className="flex items-center gap-3 p-4">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <div>
            <p className="font-medium text-yellow-800">Admin Console Access</p>
            <p className="text-sm text-yellow-700">Only grant admin access to Operations and Customer Service team members. Admins can view all platform data, suspend users, void TLAs, and cancel matches.</p>
          </div>
        </CardContent>
      </Card>

      {/* Grant Admin Access */}
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <UserPlus className="h-5 w-5" />Grant Admin Access
          </CardTitle>
          <CardDescription>Search for a user by email to grant admin console access</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Enter user email..."
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching || !searchEmail.trim()}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
          
          {searchResult && (
            <div className="mt-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{searchResult.companyName || searchResult.legalName || 'Unnamed'}</p>
                  <p className="text-sm text-muted-foreground">{searchResult.contactEmail}</p>
                </div>
                <div className="flex items-center gap-2">
                  {searchResult.isAdmin ? (
                    <Badge variant="destructive"><Shield className="h-3 w-3 mr-1" />Already Admin</Badge>
                  ) : (
                    <Button onClick={() => setGrantingUser(searchResult)}>
                      <Shield className="h-4 w-4 mr-2" />Grant Admin
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Admins */}
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Current Admins</CardTitle>
          <CardDescription>{admins.length} users with admin console access</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Granted</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableSkeleton /> : admins.length > 0 ? (
                admins.map(admin => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-red-500" />
                        {admin.companyName || admin.legalName || 'Unnamed'}
                        {admin.id === currentAdmin?.uid && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{admin.contactEmail}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(admin as any).adminGrantedAt 
                        ? format(new Date((admin as any).adminGrantedAt), 'PPp')
                        : 'Unknown'}
                    </TableCell>
                    <TableCell>
                      {admin.id !== currentAdmin?.uid && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRevokingUser(admin)}
                        >
                          <ShieldOff className="h-4 w-4 mr-1" />Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <Shield className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No admins found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Grant Admin Dialog */}
      <AlertDialog open={!!grantingUser} onOpenChange={(open) => !open && setGrantingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grant Admin Console Access</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to grant admin access to <strong>{grantingUser?.companyName || grantingUser?.contactEmail}</strong>. 
              They will be able to view all platform data, manage users, void TLAs, and cancel matches.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGrantAdmin} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Granting...</> : 'Grant Admin Access'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Admin Dialog */}
      <AlertDialog open={!!revokingUser} onOpenChange={(open) => !open && setRevokingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Admin Console Access</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to revoke admin access from <strong>{revokingUser?.companyName || revokingUser?.contactEmail}</strong>. 
              They will no longer be able to access the admin console.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeAdmin} disabled={isProcessing}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Revoking...</> : 'Revoke Access'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
