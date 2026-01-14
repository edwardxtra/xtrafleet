'use client';

import Link from "next/link";
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth, useFirestore } from "@/firebase";
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Loader2, WifiOff } from "lucide-react";
import { showSuccess, showError, showWarning } from "@/lib/toast-utils";
import { parseError } from "@/lib/error-utils";

function LoginContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get('error'));
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const router = useRouter();
  const auth = useAuth();
  const db = useFirestore();

  // Network status detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showSuccess('You\'re back online!');
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Show error from URL params as toast
  useEffect(() => {
    const urlError = searchParams.get('error');
    if (urlError) {
      showError(urlError);
    }
  }, [searchParams]);
  
  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isOnline) {
      showError('You\'re offline. Please check your connection and try again.');
      return;
    }

    setLoading(true);
    
    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
  
    // Validation
    if (!email || !password) {
      setError("Email and password are required.");
      showError("Please enter both email and password.");
      setLoading(false);
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      showError("Please enter a valid email address.");
      setLoading(false);
      return;
    }
  
    try {
      console.log('🔵 CLIENT: Setting auth persistence');
      await setPersistence(auth, browserLocalPersistence);
      
      console.log('🔵 CLIENT: About to sign in');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('🔵 CLIENT: Sign in successful, getting token');
      
      const token = await userCredential.user.getIdToken();
      console.log('🔵 CLIENT: Got token, calling API');
      
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      
      console.log('🔵 CLIENT: API response:', response.ok);

      if (response.ok) {
        console.log('🔵 CLIENT: Login successful, checking user role');
        
        // Fetch user role from Firestore
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        
        let role = null;
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          role = userData.role;
          console.log('🔵 CLIENT: User role from users collection:', role);
        } else {
          // Legacy user - check if they have an owner_operators doc
          console.log('🔵 CLIENT: No users doc, checking owner_operators...');
          const ownerDoc = await getDoc(doc(db, 'owner_operators', userCredential.user.uid));
          
          if (ownerDoc.exists()) {
            console.log('🔵 CLIENT: Found owner_operators doc, creating users doc...');
            // Create the missing users doc for this legacy user
            role = 'owner_operator';
            await setDoc(doc(db, 'users', userCredential.user.uid), {
              role: role,
              email: userCredential.user.email,
              createdAt: new Date().toISOString(),
              migratedAt: new Date().toISOString(),
            });
            console.log('✅ CLIENT: Created users doc for legacy user');
          } else {
            // User exists in Firebase Auth but has no profile at all
            // This is an incomplete registration - create their profile now
            console.log('🔵 CLIENT: No profile found, creating new owner_operator profile...');
            
            // Create owner_operators doc
            await setDoc(doc(db, 'owner_operators', userCredential.user.uid), {
              id: userCredential.user.uid,
              contactEmail: userCredential.user.email,
              companyName: '',
              subscriptionStatus: 'inactive',
              createdAt: new Date().toISOString(),
            });
            
            // Create users doc
            role = 'owner_operator';
            await setDoc(doc(db, 'users', userCredential.user.uid), {
              role: role,
              email: userCredential.user.email,
              createdAt: new Date().toISOString(),
            });
            
            console.log('✅ CLIENT: Created profile for incomplete registration');
            showWarning('Your profile was incomplete. Please complete your company profile.');
            
            // Redirect to create-profile to complete setup
            router.push('/create-profile');
            return;
          }
        }
        
        showSuccess('Login successful! Redirecting...');
        
        // Redirect based on role
        if (role === 'driver') {
          window.location.href = '/driver-dashboard';
        } else if (role === 'owner_operator') {
          window.location.href = '/dashboard';
        } else {
          throw new Error('Unknown user role. Please contact support.');
        }
      } else {
        throw new Error("Failed to create session. Please try again.");
      }
      
    } catch (e: unknown) {
      console.error('❌ Sign-in error:', e);
      const appError = parseError(e);
      
      // Use the parsed error message, or provide specific auth messages
      let errorMessage = appError.message;
      const errorCode = (e as { code?: string })?.code;
      
      if (errorCode === 'auth/invalid-credential' || 
          errorCode === 'auth/user-not-found' || 
          errorCode === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (errorCode === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please wait a few minutes and try again.';
      } else if (errorCode === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled. Please contact support.';
      }
      
      setError(errorMessage);
      showError(errorMessage, 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block">
            <Logo />
          </Link>
          <CardTitle className="font-headline text-2xl">
            Welcome Back
          </CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Offline Banner */}
          {!isOnline && (
            <Alert variant="destructive" className="mb-4">
              <WifiOff className="h-4 w-4" />
              <AlertDescription>
                You&apos;re offline. Please check your connection.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleLogin}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="m@example.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="ml-auto inline-block text-sm underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <Input 
                  id="password" 
                  name="password" 
                  type="password" 
                  required 
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !isOnline}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  'Login'
                )}
              </Button>
            </div>
          </form>
          <div className="mt-4 text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="underline">
              Sign up
            </Link>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-center justify-center">
          <Button asChild variant="link">
            <Link href="/">Back to main page</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  ); 
}
