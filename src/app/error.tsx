'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle className="font-headline text-2xl mt-4">
            Oops, Something Went Wrong
          </CardTitle>
          <CardDescription>
            We encountered an unexpected issue. Please try again or return to the homepage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Always show the error message + digest so QA / users can report
              concrete details, not just "it broke." The original code hid this
              behind NODE_ENV === 'development' which made every production
              failure impossible to attribute. The digest is also a Next.js-
              generated server-side error id that pairs to the server log
              entry, so even when the message is generic we can correlate. */}
          <div className="bg-muted p-4 rounded-md text-left text-xs text-muted-foreground overflow-auto max-h-48 space-y-2">
            {error.message && (
              <p className="font-mono break-words whitespace-pre-wrap">
                <span className="font-semibold not-italic">Error:</span> {error.message}
              </p>
            )}
            {error.digest && (
              <p className="font-mono break-all">
                <span className="font-semibold not-italic">Digest:</span> {error.digest}
              </p>
            )}
            {!error.message && !error.digest && (
              <p className="italic">No additional details available.</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-center gap-4">
          <Button onClick={() => reset()}>Try Again</Button>
          <Button asChild variant="outline">
            <Link href="/">Go to Homepage</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}