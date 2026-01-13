import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreditCard, Check, Loader2, AlertCircle, DollarSign } from "lucide-react";
import type { TLA } from "@/lib/data";
import { useUser } from "@/firebase";

interface TLAMatchFeeCardProps {
  tla: TLA;
  tlaId: string;
  isLoadOwner: boolean;
}

export function TLAMatchFeeCard({ tla, tlaId, isLoadOwner }: TLAMatchFeeCardProps) {
  const { user } = useUser();
  const [isProcessing, setIsProcessing] = useState(false);

  // Check if TLA is fully signed
  const isFullySigned = tla.status === 'signed' && tla.lessorSignature && tla.lesseeSignature;
  
  // Check if match fee has been paid
  const matchFeePaid = tla.matchFeePaid === true;

  // Only show this card if:
  // 1. TLA is fully signed
  // 2. User is the load owner
  // 3. Match fee hasn't been paid yet
  if (!isFullySigned || !isLoadOwner || matchFeePaid) {
    return null;
  }

  const handlePayMatchFee = async () => {
    if (!user) return;

    setIsProcessing(true);

    try {
      const token = await user.getIdToken();

      const response = await fetch("/api/stripe/create-match-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tlaId: tlaId,
          matchId: tla.matchId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create payment session");
      }

      const { url } = await response.json();
      
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error: any) {
      console.error("Error creating match payment:", error);
      alert(error.message || "Failed to start payment");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="border-orange-200 bg-orange-50/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Match Fee Required
        </CardTitle>
        <CardDescription>
          Payment required before trip can start
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>$25.00 match fee</strong> must be paid before the trip can begin. 
            This is a one-time fee for this TLA.
          </AlertDescription>
        </Alert>

        <div className="mt-4 text-sm text-muted-foreground">
          <p>✓ Secure payment via Stripe</p>
          <p>✓ Receipt sent via email</p>
          <p>✓ Trip unlocked after payment</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handlePayMatchFee} 
          disabled={isProcessing}
          className="w-full"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Pay $25 Match Fee
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

// Also create a component to show when fee has been paid
export function TLAMatchFeePaidCard() {
  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 text-green-700">
          <Check className="h-5 w-5" />
          Match Fee Paid
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          The $25 match fee has been paid. Trip can now be started.
        </p>
      </CardContent>
    </Card>
  );
}
