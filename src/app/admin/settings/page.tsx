'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Autocomplete, type AutocompleteOption } from '@/components/ui/autocomplete';
import { useFirestore, useUser } from '@/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Shield, ShieldOff, RefreshCw, UserPlus, AlertTriangle, Loader2, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import type { OwnerOperator } from '@/lib/data';
import { logAuditAction } from '@/lib/audit';
import { showSuccess, showError } from '@/lib/toast-utils';
import {
  AdminRole,
  ALL_ADMIN_ROLES,
  ROLE_INFO,
  getDefaultRoleForLegacyAdmin,
} from '@/lib/admin-roles';
import { useAdminRole } from '../layout';

type AdminUser = OwnerOperator & {
  isAdmin?: boolean;
  adminRole?: AdminRole;
  adminGrantedAt?: string;
  adminGrantedBy?: string;
};

export default function AdminSettingsPage() {
  const firestore = useFirestore();
  const { user: currentAdmin } = useUser();
  const { adminRole: currentUserRole } = useAdminRole();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<AdminRole>('admin');
  const [grantingUser, setGrantingUser] = useState<AdminUser | null>(null);
  const [revokingUser, setRevokingUser] = useState<AdminUser | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editingRole, setEditingRole] = useState<AdminRole>('admin');
  const [isProcessing, setIsProcessing] = useState(false);

  const canManageRoles = currentUserRole === 'super_admin';

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

  const userOptions: AutocompleteOption[] = useMemo(() => {
    return allUsers
      .filter(u => !u.isAdmin)
      .map(user => ({
        value: user.id,
        label: user.contactEmail || 'No email',
        description: user.companyName || user.legalName || undefined,
      }));
  }, [allUsers]);

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    const user = allUsers.find(u => u.id === userId);
    if (user) {
      setGrantingUser(user);
    }
  };

  const handleGrantAdmin = async () => {
    if (!firestore || !grantingUser || !currentAdmin) return;
    setIsProcessing(true);

    try {
      await updateDoc(doc(firestore, 'owner_operators', grantingUser.id), {
        isAdmin: true,
        adminRole: selectedRole,
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
        reason: `Granted admin console access with role: ${ROLE_INFO[selectedRole].name}`,
        details: { action: 'grant_admin', role: selectedRole },
      });

      showSuccess(`Admin access granted with ${ROLE_INFO[selectedRole].name} role`);
      setGrantingUser(null);
      setSelectedUserId('');
      setSelectedRole('admin');
      fetchAdmins();
    } catch (error: any) {
      showError(error.message || 'Failed to grant admin access');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!firestore || !editingUser || !currentAdmin) return;

    if (!canManageRoles) {
      showError('Only Super Admins can change admin roles');
      return;
    }

    setIsProcessing(true);

    try {
      const previousRole = editingUser.adminRole || getDefaultRoleForLegacyAdmin();

      await updateDoc(doc(firestore, 'owner_operators', editingUser.id), {
        adminRole: editingRole,
        adminRoleUpdatedAt: new Date().toISOString(),
        adminRoleUpdatedBy: currentAdmin.uid,
      });

      await logAuditAction(firestore, {
        action: 'user_updated',
        adminId: currentAdmin.uid,
        adminEmail: currentAdmin.email || '',
        targetType: 'user',
        targetId: editingUser.id,
        targetName: editingUser.companyName || editingUser.contactEmail || '',
        reason: `Changed admin role from ${ROLE_INFO[previousRole].name} to ${ROLE_INFO[editingRole].name}`,
        details: { action: 'change_role', previousRole, newRole: editingRole },
      });

      showSuccess(`Role updated to ${ROLE_INFO[editingRole].name}`);
      setEditingUser(null);
      fetchAdmins();
    } catch (error: any) {
      showError(error.message || 'Failed to update role');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevokeAdmin = async () => {
    if (!firestore || !revokingUser || !currentAdmin) return;

    if (revokingUser.id === currentAdmin.uid) {
      showError('You cannot revoke your own admin access');
      setRevokingUser(null);
      return;
    }

    if (!canManageRoles) {
      showError('Only Super Admins can revoke admin access');
      setRevokingUser(null);
      return;
    }

    setIsProcessing(true);

    try {
      await updateDoc(doc(firestore, 'owner_operators', revokingUser.id), {
        isAdmin: false,
        adminRole: null,
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

  const handleEditRole = (admin: AdminUser) => {
    setEditingUser(admin);
    setEditingRole(admin.adminRole || getDefaultRoleForLegacyAdmin());
  };

  const getRoleBadgeVariant = (role: AdminRole): 'destructive' | 'default' | 'secondary' | 'outline' => {
    const color = ROLE_INFO[role].color;
    if (color === 'destructive') return 'destructive';
    if (color === 'default') return 'default';
    if (color === 'secondary') return 'secondary';
    return 'outline';
  };

  const TableSkeleton = () => (
    <>{[1,2,3].map(i => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
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
      <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800">
        <CardContent className="flex items-center gap-3 p-4">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-200">Admin Console Access Tiers</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              <strong>Super Admin:</strong> Full access including admin management.{' '}
              <strong>Admin:</strong> Full operations access.{' '}
              <strong>Support:</strong> View-only access.{' '}
              <strong>Billing Admin:</strong> Billing management only.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Grant Admin Access */}
      {canManageRoles && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
              <UserPlus className="h-5 w-5" />Grant Admin Access
            </CardTitle>
            <CardDescription>Search for a user to grant admin console access</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 max-w-xl">
              <div className="flex-1">
                <Label className="text-sm text-muted-foreground mb-2 block">User</Label>
                <Autocomplete
                  options={userOptions}
                  value={selectedUserId}
                  onValueChange={handleUserSelect}
                  placeholder="Search by email or company name..."
                  searchPlaceholder="Type to search users..."
                  emptyMessage="No users found"
                  isLoading={isLoading}
                />
              </div>
              <div className="w-full md:w-48">
                <Label className="text-sm text-muted-foreground mb-2 block">Role</Label>
                <Select value={selectedRole} onValueChange={(val) => setSelectedRole(val as AdminRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ADMIN_ROLES.map(role => (
                      <SelectItem key={role} value={role}>
                        <div className="flex flex-col">
                          <span>{ROLE_INFO[role].name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                <TableHead>Role</TableHead>
                <TableHead>Granted</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableSkeleton /> : admins.length > 0 ? (
                admins.map(admin => {
                  const role = admin.adminRole || getDefaultRoleForLegacyAdmin();
                  return (
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
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(role)}>
                          {ROLE_INFO[role].name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {admin.adminGrantedAt
                          ? format(new Date(admin.adminGrantedAt), 'PPp')
                          : 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {canManageRoles && admin.id !== currentAdmin?.uid && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditRole(admin)}
                              >
                                <Edit2 className="h-4 w-4 mr-1" />Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setRevokingUser(admin)}
                              >
                                <ShieldOff className="h-4 w-4 mr-1" />Revoke
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
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
      <AlertDialog open={!!grantingUser} onOpenChange={(open) => { if (!open) { setGrantingUser(null); setSelectedUserId(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grant Admin Console Access</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to grant <strong>{ROLE_INFO[selectedRole].name}</strong> access to{' '}
              <strong>{grantingUser?.companyName || grantingUser?.contactEmail}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">{ROLE_INFO[selectedRole].description}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGrantAdmin} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Granting...</> : 'Grant Admin Access'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Role Dialog */}
      <AlertDialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Admin Role</AlertDialogTitle>
            <AlertDialogDescription>
              Change the admin role for <strong>{editingUser?.companyName || editingUser?.contactEmail}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Select New Role</Label>
            <Select value={editingRole} onValueChange={(val) => setEditingRole(val as AdminRole)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ADMIN_ROLES.map(role => (
                  <SelectItem key={role} value={role}>
                    <div className="flex flex-col">
                      <span>{ROLE_INFO[role].name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-2">{ROLE_INFO[editingRole].description}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateRole} disabled={isProcessing}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating...</> : 'Update Role'}
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
