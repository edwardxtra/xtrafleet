import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from '@/firebase';

export const metadata: Metadata = {
  title: 'XtraFleet - Driver Management Platform',
  description: 'Compliance-first driver management for owner-operators',
  manifest: '/manifest.json',
  icons: {
    icon: '/images/xtrafleet-logomark.png',
    apple: '/images/xtrafleet-logomark.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'XtraFleet',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'XtraFleet',
    title: 'XtraFleet - Driver Management Platform',
    description: 'Compliance-first driver management for owner-operators',
    images: ['/images/xtrafleet-logo.png'],
  },
  twitter: {
    card: 'summary',
    title: 'XtraFleet - Driver Management Platform',
    description: 'Compliance-first driver management for owner-operators',
    images: ['/images/xtrafleet-logo.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#1A9BAA',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
        
        {/* PWA Meta Tags */}
        <link rel="apple-touch-icon" href="/images/xtrafleet-logomark.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="XtraFleet" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#1A9BAA" />
        <meta name="msapplication-tap-highlight" content="no" />
        
        {/* Dark mode script - runs before render to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const stored = localStorage.getItem('theme');
                const theme = stored || 'dark';
                document.documentElement.classList.toggle('dark', theme === 'dark');
              })();
            `,
          }}
        />
      </head>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          {children}
        </FirebaseClientProvider>
        <Toaster />
        
        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('ServiceWorker registration successful');
                    },
                    function(err) {
                      console.log('ServiceWorker registration failed: ', err);
                    }
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
