'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useUser, useAuth, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useTheme } from 'next-themes';
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
} from '@/components/ui/sidebar';
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
import { Logo } from '@/components/logo';
import { Home, User, History, LogOut, Settings, Loader2, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

function SidebarNavLink({ 
  href, 
  children, 
  tooltip 
}: { 
  href: string; 
  children: React.ReactNode; 
  tooltip: string;
}) {
  const { setOpenMobile, isMobile } = useSidebar();
  const pathname = usePathname();
  const isActive = pathname === href;

  const handleClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <SidebarMenuButton asChild tooltip={tooltip} isActive={isActive}>
      <Link href={href} onClick={handleClick}>
        {children}
      </Link>
    </SidebarMenuButton>
  );
}

function SidebarNav({ onSignOutClick }: { onSignOutClick: () => void }) {
  const { setOpenMobile, isMobile } = useSidebar();

  const handleSignOutClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    onSignOutClick();
  };

  return (
    <>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarNavLink href="/driver-dashboard" tooltip="Dashboard">
              <Home />
              <span>Dashboard</span>
            </SidebarNavLink>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarNavLink href="/driver-dashboard/profile" tooltip="Profile">
              <User />
              <span>Profile</span>
            </SidebarNavLink>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarNavLink href="/driver-dashboard/matches" tooltip="Past Matches">
              <History />
              <span>Past Matches</span>
            </SidebarNavLink>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarNavLink href="/driver-dashboard/settings" tooltip="Settings">
              <Settings />
              <span>Settings</span>
            </SidebarNavLink>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOutClick} tooltip="Logout">
              <LogOut />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <Button variant="ghost" size="icon"><Moon className="h-5 w-5" /></Button>;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </Button>
  );
}

export default function DriverDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const [roleChecked, setRoleChecked] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    async function checkRole() {
      if (!user || !db) return;

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.role !== 'driver') {
            router.push('/dashboard');
            return;
          }
        }
        setRoleChecked(true);
      } catch (error) {
        console.error('Error checking role:', error);
        setRoleChecked(true);
      }
    }

    if (user && db) {
      checkRole();
    }
  }, [user, db, router]);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      await fetch('/api/auth/session', { method: 'DELETE' });
      router.push('/login');
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  if (isUserLoading || !roleChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Link href="/" passHref>
            <Logo />
          </Link>
        </SidebarHeader>
        <SidebarNav onSignOutClick={() => setShowLogoutDialog(true)} />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b bg-background px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-lg font-semibold">Driver Dashboard</h1>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to access your dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut}>
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}