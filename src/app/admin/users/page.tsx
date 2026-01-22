'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { Search, MoreHorizontal, Users, Truck, Package, Eye, RefreshCw, Building2, Ban, CheckCircle, Download, Loader2, UserPlus, Edit2, Trash2 } from 'lucide-react';
import type { OwnerOperator } from '@/lib/data';
import { logAuditAction } from '@/lib/audit';
import { showSuccess, showError } from '@/lib/toast-utils';
import { useAdminRole } from '../layout';

type UserWithStats = OwnerOperator & {
  driversCount: number;
  loadsCount: number;
  isSuspended?: boolean;
  suspendedReason?: string;
};

type EditableUserFields = {
  companyName: string;
  legalName: string;
  contactEmail: string;
  phone: string;
  dotNumber: string;
  mcNumber: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

export default function AdminUsersPage() {
  const firestore = useFirestore();
  const { user: adminUser } = useUser();
  const { hasPermission } = useAdminRole();
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [suspendingUser, setSuspendingUser] = useState<UserWithStats | null>(null);
  const [editingUser, setEditingUser] = useState<UserWithStats | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserWithStats | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Editable form state
  const [editForm, setEditForm] = useState<EditableUserFields>({
    companyName: '',
    legalName: '',
    contactEmail: '',
    phone: '',
    dotNumber: '',
    mcNumber: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  });

  // Create form state
  const [createForm, setCreateForm] = useState<EditableUserFields>({
    companyName: '',
    legalName: '',
    contactEmail: '',
    phone: '',
    dotNumber: '',
    mcNumber: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  });

  const canCreate = hasPermission('users:create');
  const canEdit = hasPermission('users:edit');
  const canDelete = hasPermission('users:delete');
  const canSuspend = hasPermission('users:suspend');

  const fetchUsers = async () => {
    if (!firestore) return;
    setIsLoading(true);

    try {
      const usersSnap = await getDocs(collection(firestore, 'owner_operators'));
      const usersData: UserWithStats[] = [];

      for (const userDoc of usersSnap.docs) {
        const userData = { id: userDoc.id, ...userDoc.data() } as OwnerOperator & { isSuspended?: boolean; suspendedReason?: string };

        const driversSnap = await getDocs(collection(firestore, `owner_operators/${userDoc.id}/drivers`));
        const driversCount = driversSnap.size;

        const loadsSnap = await getDocs(collection(firestore, `owner_operators/${userDoc.id}/loads`));
        const loadsCount = loadsSnap.size;

        usersData.push({
          ...userData,
          driversCount,
          loadsCount,
        });
      }

      setUsers(usersData);
      setFilteredUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [firestore]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredUsers(users);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredUsers(users.filter(user =>
        user.companyName?.toLowerCase().includes(q) ||
        user.legalName?.toLowerCase().includes(q) ||
        user.contactEmail?.toLowerCase().includes(q) ||
        user.dotNumber?.toLowerCase().includes(q)
      ));
    }
  }, [searchQuery, users]);

  const handleCreateUser = async () => {
    if (!firestore || !adminUser) return;

    if (!createForm.contactEmail || !createForm.companyName) {
      showError('Company name and email are required');
      return;
    }

    setIsProcessing(true);
    try {
      // Generate a new document ID
      const newUserId = `admin_created_${Date.now()}`;
      const newUserRef = doc(firestore, 'owner_operators', newUserId);

      await setDoc(newUserRef, {
        ...createForm,
        createdAt: new Date().toISOString(),
        createdBy: adminUser.uid,
        createdByAdmin: true,
      });

      await logAuditAction(firestore, {
        action: 'user_created',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'user',
        targetId: newUserId,
        targetName: createForm.companyName || createForm.contactEmail,
        reason: 'Created via admin console',
      });

      showSuccess('User created successfully');
      setCreateDialogOpen(false);
      setCreateForm({
        companyName: '',
        legalName: '',
        contactEmail: '',
        phone: '',
        dotNumber: '',
        mcNumber: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
      });
      fetchUsers();
    } catch (error: any) {
      showError(error.message || 'Failed to create user');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditUser = async () => {
    if (!firestore || !editingUser || !adminUser) return;

    setIsProcessing(true);
    try {
      await updateDoc(doc(firestore, 'owner_operators', editingUser.id), {
        ...editForm,
        updatedAt: new Date().toISOString(),
        updatedBy: adminUser.uid,
      });

      await logAuditAction(firestore, {
        action: 'user_updated',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'user',
        targetId: editingUser.id,
        targetName: editForm.companyName || editForm.contactEmail,
        reason: 'Profile updated via admin console',
      });

      showSuccess('User updated successfully');
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      showError(error.message || 'Failed to update user');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!firestore || !deletingUser || !adminUser) return;

    if (deletingUser.isAdmin) {
      showError('Cannot delete admin users');
      setDeletingUser(null);
      return;
    }

    setIsProcessing(true);
    try {
      const batch = writeBatch(firestore);

      // Delete all subcollections (drivers, loads, messages, etc.)
      const driversSnap = await getDocs(collection(firestore, `owner_operators/${deletingUser.id}/drivers`));
      driversSnap.docs.forEach(d => batch.delete(d.ref));

      const loadsSnap = await getDocs(collection(firestore, `owner_operators/${deletingUser.id}/loads`));
      loadsSnap.docs.forEach(d => batch.delete(d.ref));

      // Delete the main user document
      batch.delete(doc(firestore, 'owner_operators', deletingUser.id));

      await batch.commit();

      await logAuditAction(firestore, {
        action: 'user_deleted',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'user',
        targetId: deletingUser.id,
        targetName: deletingUser.companyName || deletingUser.legalName || deletingUser.contactEmail,
        reason: 'Deleted via admin console',
        details: { driversDeleted: driversSnap.size, loadsDeleted: loadsSnap.size },
      });

      showSuccess('User and all associated data deleted');
      setDeletingUser(null);
      fetchUsers();
    } catch (error: any) {
      showError(error.message || 'Failed to delete user');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSuspendUser = async () => {
    if (!firestore || !suspendingUser || !adminUser) return;

    setIsProcessing(true);
    try {
      await updateDoc(doc(firestore, 'owner_operators', suspendingUser.id), {
        isSuspended: true,
        suspendedReason: suspendReason,
        suspendedAt: new Date().toISOString(),
        suspendedBy: adminUser.uid,
      });

      await logAuditAction(firestore, {
        action: 'user_suspended',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'user',
        targetId: suspendingUser.id,
        targetName: suspendingUser.companyName || suspendingUser.legalName || suspendingUser.contactEmail,
        reason: suspendReason,
      });

      showSuccess('User suspended successfully');
      setSuspendingUser(null);
      setSuspendReason('');
      fetchUsers();
    } catch (error: any) {
      showError(error.message || 'Failed to suspend user');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReactivateUser = async (user: UserWithStats) => {
    if (!firestore || !adminUser) return;

    setIsProcessing(true);
    try {
      await updateDoc(doc(firestore, 'owner_operators', user.id), {
        isSuspended: false,
        suspendedReason: null,
        suspendedAt: null,
        suspendedBy: null,
        reactivatedAt: new Date().toISOString(),
        reactivatedBy: adminUser.uid,
      });

      await logAuditAction(firestore, {
        action: 'user_reactivated',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'user',
        targetId: user.id,
        targetName: user.companyName || user.legalName || user.contactEmail,
      });

      showSuccess('User reactivated successfully');
      fetchUsers();
    } catch (error: any) {
      showError(error.message || 'Failed to reactivate user');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenEdit = (user: UserWithStats) => {
    setEditForm({
      companyName: user.companyName || '',
      legalName: user.legalName || '',
      contactEmail: user.contactEmail || '',
      phone: user.phone || '',
      dotNumber: user.dotNumber || '',
      mcNumber: user.mcNumber || '',
      address: (user as any).address || '',
      city: (user as any).city || '',
      state: (user as any).state || '',
      zipCode: (user as any).zipCode || '',
    });
    setEditingUser(user);
  };

  const handleExport = () => {
    const headers = ['Company', 'Legal Name', 'Email', 'Phone', 'DOT #', 'MC #', 'Drivers', 'Loads', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredUsers.map(user => [
        `"${user.companyName || ''}"`,
        `"${user.legalName || ''}"`,
        `"${user.contactEmail || ''}"`,
        `"${user.phone || ''}"`,
        `"${user.dotNumber || ''}"`,
        `"${user.mcNumber || ''}"`,
        user.driversCount,
        user.loadsCount,
        user.isSuspended ? 'Suspended' : 'Active',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    if (firestore && adminUser) {
      logAuditAction(firestore, {
        action: 'data_exported',
        adminId: adminUser.uid,
        adminEmail: adminUser.email || '',
        targetType: 'system',
        targetId: 'users',
        targetName: 'Users Export',
        details: { count: filteredUsers.length },
      });
    }
  };

  const TableSkeleton = () => (
    <>
      {[1,2,3,4,5].map(i => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-8 w-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">User Management</h1>
          <p className="text-muted-foreground">View and manage all registered owner operators</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canCreate && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />Add User
            </Button>
          )}
          <Button variant="outline" onClick={handleExport} disabled={filteredUsers.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
          <Button variant="outline" onClick={fetchUsers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="font-headline">All Users</CardTitle>
              <CardDescription>{filteredUsers.length} total users</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search users..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Drivers</TableHead>
                <TableHead>Loads</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map(user => (
                  <TableRow key={user.id} className={user.isSuspended ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate max-w-[150px]">{user.companyName || user.legalName || 'Unnamed'}</span>
                        {user.isAdmin && <Badge variant="destructive" className="ml-1">Admin</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm truncate max-w-[180px]">{user.contactEmail}</p>
                        {user.phone && <p className="text-xs text-muted-foreground">{user.phone}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                        <Truck className="h-3 w-3" />{user.driversCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        <Package className="h-3 w-3" />{user.loadsCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.isSuspended ? (
                        <Badge variant="destructive"><Ban className="h-3 w-3 mr-1" />Suspended</Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setSelectedUser(user)}>
                            <Eye className="h-4 w-4 mr-2" />View Details
                          </DropdownMenuItem>
                          {canEdit && (
                            <DropdownMenuItem onClick={() => handleOpenEdit(user)}>
                              <Edit2 className="h-4 w-4 mr-2" />Edit User
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {canSuspend && (
                            user.isSuspended ? (
                              <DropdownMenuItem onClick={() => handleReactivateUser(user)} className="text-green-600">
                                <CheckCircle className="h-4 w-4 mr-2" />Reactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setSuspendingUser(user)} className="text-destructive" disabled={user.isAdmin}>
                                <Ban className="h-4 w-4 mr-2" />Suspend
                              </DropdownMenuItem>
                            )
                          )}
                          {canDelete && !user.isAdmin && (
                            <DropdownMenuItem onClick={() => setDeletingUser(user)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />Delete User
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No users found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline">{selectedUser?.companyName || selectedUser?.legalName}</DialogTitle>
            <DialogDescription>User Details</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              {selectedUser.isSuspended && (
                <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">Account Suspended</p>
                  {selectedUser.suspendedReason && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{selectedUser.suspendedReason}</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-muted-foreground">Legal Name</p><p className="font-medium">{selectedUser.legalName || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Company Name</p><p className="font-medium">{selectedUser.companyName || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">Email</p><p className="font-medium break-all">{selectedUser.contactEmail}</p></div>
                <div><p className="text-sm text-muted-foreground">Phone</p><p className="font-medium">{selectedUser.phone || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">DOT Number</p><p className="font-medium">{selectedUser.dotNumber || '-'}</p></div>
                <div><p className="text-sm text-muted-foreground">MC Number</p><p className="font-medium">{selectedUser.mcNumber || '-'}</p></div>
              </div>
              <div className="flex gap-4 pt-4 border-t">
                <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" /><span>{selectedUser.driversCount} Drivers</span></div>
                <div className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" /><span>{selectedUser.loadsCount} Loads</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            {canEdit && (
              <Button variant="outline" onClick={() => { setSelectedUser(null); handleOpenEdit(selectedUser!); }}>
                <Edit2 className="h-4 w-4 mr-2" />Edit User
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-headline">Create New User</DialogTitle>
            <DialogDescription>Add a new owner operator to the platform</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-company">Company Name *</Label>
                  <Input id="create-company" value={createForm.companyName} onChange={(e) => setCreateForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-legal">Legal Name</Label>
                  <Input id="create-legal" value={createForm.legalName} onChange={(e) => setCreateForm(f => ({ ...f, legalName: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-email">Email *</Label>
                  <Input id="create-email" type="email" value={createForm.contactEmail} onChange={(e) => setCreateForm(f => ({ ...f, contactEmail: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-phone">Phone</Label>
                  <Input id="create-phone" value={createForm.phone} onChange={(e) => setCreateForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-dot">DOT Number</Label>
                  <Input id="create-dot" value={createForm.dotNumber} onChange={(e) => setCreateForm(f => ({ ...f, dotNumber: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-mc">MC Number</Label>
                  <Input id="create-mc" value={createForm.mcNumber} onChange={(e) => setCreateForm(f => ({ ...f, mcNumber: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-address">Address</Label>
                <Input id="create-address" value={createForm.address} onChange={(e) => setCreateForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-city">City</Label>
                  <Input id="create-city" value={createForm.city} onChange={(e) => setCreateForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-state">State</Label>
                  <Input id="create-state" value={createForm.state} onChange={(e) => setCreateForm(f => ({ ...f, state: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-zip">ZIP Code</Label>
                  <Input id="create-zip" value={createForm.zipCode} onChange={(e) => setCreateForm(f => ({ ...f, zipCode: e.target.value }))} />
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={isProcessing || !createForm.companyName || !createForm.contactEmail}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-headline">Edit User</DialogTitle>
            <DialogDescription>Update user profile information</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-company">Company Name</Label>
                  <Input id="edit-company" value={editForm.companyName} onChange={(e) => setEditForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-legal">Legal Name</Label>
                  <Input id="edit-legal" value={editForm.legalName} onChange={(e) => setEditForm(f => ({ ...f, legalName: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input id="edit-email" type="email" value={editForm.contactEmail} onChange={(e) => setEditForm(f => ({ ...f, contactEmail: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input id="edit-phone" value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-dot">DOT Number</Label>
                  <Input id="edit-dot" value={editForm.dotNumber} onChange={(e) => setEditForm(f => ({ ...f, dotNumber: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-mc">MC Number</Label>
                  <Input id="edit-mc" value={editForm.mcNumber} onChange={(e) => setEditForm(f => ({ ...f, mcNumber: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-address">Address</Label>
                <Input id="edit-address" value={editForm.address} onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-city">City</Label>
                  <Input id="edit-city" value={editForm.city} onChange={(e) => setEditForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-state">State</Label>
                  <Input id="edit-state" value={editForm.state} onChange={(e) => setEditForm(f => ({ ...f, state: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-zip">ZIP Code</Label>
                  <Input id="edit-zip" value={editForm.zipCode} onChange={(e) => setEditForm(f => ({ ...f, zipCode: e.target.value }))} />
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={handleEditUser} disabled={isProcessing}>
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deletingUser?.companyName || deletingUser?.legalName}</strong> and all associated data
              ({deletingUser?.driversCount} drivers, {deletingUser?.loadsCount} loads). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suspend User Dialog */}
      <AlertDialog open={!!suspendingUser} onOpenChange={(open) => { if (!open) { setSuspendingUser(null); setSuspendReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend User Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will suspend the account for <strong>{suspendingUser?.companyName || suspendingUser?.legalName}</strong>.
              They will not be able to access the platform until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="suspend-reason">Reason for suspension</Label>
            <Textarea
              id="suspend-reason"
              placeholder="Enter the reason for suspending this account..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSuspendUser} disabled={isProcessing || !suspendReason.trim()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Suspending...</> : 'Suspend User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
