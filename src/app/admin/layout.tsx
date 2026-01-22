'use client';
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useUser, useAuth, useFirestore } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  SidebarProvider,
  Sidebar,
  SidebarTrigger,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Logo } from "@/components/logo";
import { Home, Users, Truck, LogOut, Loader2, FileText, Link2, Shield, ClipboardList, Package, Settings, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AdminRole,
  hasPermission,
  canAccessRoute,
  getDefaultRoleForLegacyAdmin,
  ROLE_INFO,
} from "@/lib/admin-roles";

// Create context for admin role
type AdminContextType = {
  adminRole: AdminRole | null;
  hasPermission: (permission: string) => boolean;
};

const AdminContext = createContext<AdminContextType>({
  adminRole: null,
  hasPermission: () => false,
});

export const useAdminRole = () => useContext(AdminContext);

function AdminSidebarNavLink({ href, children, tooltip }: { href: string; children: React.ReactNode; tooltip: string; }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const pathname = usePathname();
  const isActive = pathname === href;
  const handleClick = () => { if (isMobile) setOpenMobile(false); };
  return (
    <SidebarMenuButton asChild tooltip={tooltip} isActive={isActive}>
      <Link href={href} onClick={handleClick}>{children}</Link>
    </SidebarMenuButton>
  );
}

function AdminSidebarNav({ onSignOutClick, adminRole }: { onSignOutClick: () => void; adminRole: AdminRole }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const handleSignOutClick = () => { if (isMobile) setOpenMobile(false); onSignOutClick(); };

  const checkPermission = (permission: string) => hasPermission(adminRole, permission as any);

  return (
    <>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <AdminSidebarNavLink href="/admin" tooltip="Dashboard"><Home /><span>Dashboard</span></AdminSidebarNavLink>
          </SidebarMenuItem>
          {checkPermission('users:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/users" tooltip="Users"><Users /><span>Users (OOs)</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('drivers:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/drivers" tooltip="Drivers"><Truck /><span>All Drivers</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('loads:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/loads" tooltip="Loads"><Package /><span>All Loads</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('matches:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/matches" tooltip="Matches"><Link2 /><span>Matches</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('tlas:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/tlas" tooltip="TLAs"><FileText /><span>TLAs</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('audit:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/audit" tooltip="Audit Log"><ClipboardList /><span>Audit Log</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
          {checkPermission('billing:view') && (
            <SidebarMenuItem>
              <AdminSidebarNavLink href="/admin/billing" tooltip="Users & Billing"><CreditCard /><span>Users & Billing</span></AdminSidebarNavLink>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
        {checkPermission('admin:manage_roles') && (
          <>
            <Separator className="my-2" />
            <SidebarMenu>
              <SidebarMenuItem>
                <AdminSidebarNavLink href="/admin/settings" tooltip="Admin Access"><Settings /><span>Admin Access</span></AdminSidebarNavLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to Dashboard">
              <Link href="/dashboard"><Home /><span>User Dashboard</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOutClick} tooltip="Logout"><LogOut /><span>Logout</span></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const pathname = usePathname();
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login?error=You must be logged in to access this page.');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    async function checkAdmin() {
      if (!user || !db) return;
      setIsCheckingAdmin(true);
      try {
        const ownerDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (ownerDoc.exists()) {
          const data = ownerDoc.data();
          if (data.isAdmin === true) {
            // Check for new role field, fallback to default for legacy admins
            const role = data.adminRole as AdminRole || getDefaultRoleForLegacyAdmin();
            setAdminRole(role);

            // Check route access based on role
            if (!canAccessRoute(role, pathname)) {
              router.push('/admin');
            }
          } else {
            setAdminRole(null);
            router.push('/dashboard');
          }
        } else {
          setAdminRole(null);
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Error checking admin:', error);
        setAdminRole(null);
        router.push('/dashboard');
      } finally {
        setIsCheckingAdmin(false);
      }
    }
    if (user && db) checkAdmin();
  }, [user, db, router, pathname]);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      await fetch('/api/auth/session', { method: 'DELETE' });
      router.push('/login');
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  const contextValue: AdminContextType = {
    adminRole,
    hasPermission: (permission: string) => hasPermission(adminRole || undefined, permission as any),
  };

  if (isUserLoading || isCheckingAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user || !adminRole) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const roleInfo = ROLE_INFO[adminRole];

  return (
    <AdminContext.Provider value={contextValue}>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2">
              <Logo linkTo="/admin" forceLight />
              <Badge variant="destructive" className="text-xs">Admin</Badge>
            </div>
          </SidebarHeader>
          <AdminSidebarNav onSignOutClick={() => setShowLogoutDialog(true)} adminRole={adminRole} />
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="md:hidden" />
              <Badge variant="destructive"><Shield className="h-3 w-3 mr-1" />Admin Console</Badge>
              <Badge variant={roleInfo.color as any} className="text-xs hidden sm:inline-flex">
                {roleInfo.name}
              </Badge>
            </div>
            <div className="ml-auto text-sm text-muted-foreground">{user?.email}</div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </SidebarInset>
        <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
              <AlertDialogDescription>You will need to sign in again to access the admin console.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignOut}>Logout</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarProvider>
    </AdminContext.Provider>
  );
}
