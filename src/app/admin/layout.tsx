'use client';
import { useEffect, useState } from "react";
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
import { Home, Users, Truck, LogOut, Loader2, FileText, Link2, Shield, ClipboardList, Package, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

function AdminSidebarNav({ onSignOutClick }: { onSignOutClick: () => void }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const handleSignOutClick = () => { if (isMobile) setOpenMobile(false); onSignOutClick(); };
  return (
    <>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <AdminSidebarNavLink href="/admin" tooltip="Dashboard"><Home /><span>Dashboard</span></AdminSidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <AdminSidebarNavLink href="/admin/users" tooltip="Users"><Users /><span>Users (OOs)</span></AdminSidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <AdminSidebarNavLink href="/admin/drivers" tooltip="Drivers"><Truck /><span>All Drivers</span></AdminSidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <AdminSidebarNavLink href="/admin/loads" tooltip="Loads"><Package /><span>All Loads</span></AdminSidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <AdminSidebarNavLink href="/admin/matches" tooltip="Matches"><Link2 /><span>Matches</span></AdminSidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <AdminSidebarNavLink href="/admin/tlas" tooltip="TLAs"><FileText /><span>TLAs</span></AdminSidebarNavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <AdminSidebarNavLink href="/admin/audit" tooltip="Audit Log"><ClipboardList /><span>Audit Log</span></AdminSidebarNavLink>
          </SidebarMenuItem>
        </SidebarMenu>
        <Separator className="my-2" />
        <SidebarMenu>
          <SidebarMenuItem>
            <AdminSidebarNavLink href="/admin/settings" tooltip="Admin Access"><Settings /><span>Admin Access</span></AdminSidebarNavLink>
          </SidebarMenuItem>
        </SidebarMenu>
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
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login?error=You must be logged in to access this page.');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    async function checkAdmin() {
      if (!user || !db) return;
      try {
        const ownerDoc = await getDoc(doc(db, 'owner_operators', user.uid));
        if (ownerDoc.exists() && ownerDoc.data().isAdmin === true) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Error checking admin:', error);
        setIsAdmin(false);
        router.push('/dashboard');
      }
    }
    if (user && db) checkAdmin();
  }, [user, db, router]);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      await fetch('/api/auth/session', { method: 'DELETE' });
      router.push('/login');
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  if (isUserLoading || isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Link href="/admin" passHref className="flex items-center gap-2">
            <Logo />
            <Badge variant="destructive" className="text-xs">Admin</Badge>
          </Link>
        </SidebarHeader>
        <AdminSidebarNav onSignOutClick={() => setShowLogoutDialog(true)} />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b bg-background px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <Badge variant="destructive"><Shield className="h-3 w-3 mr-1" />Admin Console</Badge>
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
  );
}
