"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreditCard, Clock, Check, AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { useUser } from "@/firebase";
import { format, parseISO } from "date-fns";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const PLAN_PRICES = {
  monthly: { price: "$49.99", interval: "month", priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY },
  six_month: { price: "$269.99", interval: "6 months", priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SIX_MONTH },
  annual: { price: "$499.99", interval: "year", priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL },
};

export default function BillingPage() {
  const { user } = useUser();
  const { subscription, isLoading } = useSubscription();
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const handleSubscribe = async (planType: "monthly" | "six_month" | "annual") => {
    if (!user) return;

    setIsCreatingCheckout(true);

    try {
      const token = await user.getIdToken();
      const plan = PLAN_PRICES[planType];

      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          priceId: plan.priceId,
          planType: planType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create checkout session");
      }

      const { url } = await response.json();
      
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error: any) {
      console.error("Error creating checkout:", error);
      alert(error.message || "Failed to start checkout");
    } finally {
      setIsCreatingCheckout(false);
    }
  };

  const handleManageBilling = async () => {
    if (!user) return;

    setIsOpeningPortal(true);

    try {
      const token = await user.getIdToken();

      const response = await fetch("/api/stripe/customer-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to open billing portal");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error: any) {
      console.error("Error opening portal:", error);
      alert("Failed to open billing portal");
    } finally {
      setIsOpeningPortal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      return format(parseISO(dateString), "MMM d, yyyy");
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = () => {
    if (subscription.isInTrial) {
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Free Trial</Badge>;
    }
    if (subscription.subscriptionStatus === "active") {
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>;
    }
    if (subscription.isPastDue) {
      return <Badge variant="destructive">Past Due</Badge>;
    }
    if (subscription.isCanceled) {
      return <Badge variant="secondary">Canceled</Badge>;
    }
    return <Badge variant="secondary">No Subscription</Badge>;
  };

  const getPlanDisplayName = (planType: string | null) => {
    if (!planType) return "No Plan";
    const planNames: Record<string, string> = {
      monthly: "Monthly Plan",
      six_month: "6-Month Plan",
      annual: "Yearly Plan"
    };
    return planNames[planType] || planType;
  };

  const isCurrentPlan = (planType: string) => {
    return subscription.planType === planType;
  };

  const getButtonText = (planType: string) => {
    if (isCurrentPlan(planType)) {
      return "Current Plan";
    }
    if (subscription.hasActiveSubscription) {
      return "Switch Plan";
    }
    return "Subscribe";
  };

  return (
    <div className="grid gap-6">
      {/* Trial Warning */}
      {subscription.isInTrial && subscription.daysUntilTrialEnd !== null && subscription.daysUntilTrialEnd <= 7 && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            <strong>Your trial ends in {subscription.daysUntilTrialEnd} days.</strong>
            {" "}Your subscription will automatically start on {formatDate(subscription.trialEndsAt)}.
          </AlertDescription>
        </Alert>
      )}

      {/* Past Due Warning */}
      {subscription.isPastDue && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Payment failed.</strong> Please update your payment method to avoid service interruption.
          </AlertDescription>
        </Alert>
      )}

      {/* No Subscription */}
      {!subscription.hasActiveSubscription && !subscription.isCanceled && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>No active subscription.</strong> Subscribe to continue using XtraFleet.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Current Subscription Card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="font-headline flex items-center justify-between">
              Subscription
              {getStatusBadge()}
            </CardTitle>
            <CardDescription>
              Your current plan and billing cycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription.hasActiveSubscription ? (
              <>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Plan</p>
                  <p className="text-lg font-semibold text-primary">{getPlanDisplayName(subscription.planType)}</p>
                </div>

                {subscription.isInTrial && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Trial Ends</p>
                    <p className="text-muted-foreground">{formatDate(subscription.trialEndsAt)}</p>
                    <p className="text-xs text-muted-foreground">
                      {subscription.daysUntilTrialEnd} days remaining
                    </p>
                  </div>
                )}

                {!subscription.isInTrial && subscription.subscriptionPeriodEnd && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Next Billing Date</p>
                    <p className="text-muted-foreground">{formatDate(subscription.subscriptionPeriodEnd)}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No active subscription</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            {subscription.hasActiveSubscription ? (
              <Button onClick={handleManageBilling} disabled={isOpeningPortal}>
                {isOpeningPortal && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <CreditCard className="h-4 w-4 mr-2" />
                Manage Billing
              </Button>
            ) : (
              <p className="text-xs text-center text-muted-foreground">
                Subscribe below to get started
              </p>
            )}
          </CardFooter>
        </Card>

        {/* Subscription Plans */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="font-headline">Subscription Plans</CardTitle>
            <CardDescription>
              {subscription.hasActiveSubscription 
                ? "You can switch plans anytime. Changes take effect at your next billing cycle."
                : "Choose a plan that works for you. All plans include unlimited loads and drivers."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Monthly Plan */}
            <div className={`border rounded-lg p-4 flex items-center justify-between ${isCurrentPlan("monthly") ? "border-primary border-2 bg-primary/5" : ""}`}>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">Monthly Plan</p>
                  {isCurrentPlan("monthly") && <Badge variant="outline" className="bg-primary text-primary-foreground">Current</Badge>}
                </div>
                <p className="text-2xl font-bold text-primary">$49.99<span className="text-sm text-muted-foreground">/month</span></p>
                <p className="text-xs text-muted-foreground mt-1">Billed monthly • Cancel anytime</p>
              </div>
              <Button 
                onClick={() => handleSubscribe("monthly")} 
                disabled={isCreatingCheckout || isCurrentPlan("monthly")}
                variant={isCurrentPlan("monthly") ? "secondary" : "default"}
              >
                {getButtonText("monthly")}
              </Button>
            </div>

            {/* 6-Month Plan */}
            <div className={`border rounded-lg p-4 flex items-center justify-between ${isCurrentPlan("six_month") ? "border-primary border-2 bg-primary/5" : "bg-muted/30"}`}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold">6-Month Plan</p>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">Save 10%</Badge>
                  {isCurrentPlan("six_month") && <Badge variant="outline" className="bg-primary text-primary-foreground">Current</Badge>}
                </div>
                <p className="text-2xl font-bold text-primary">$269.99<span className="text-sm text-muted-foreground">/6 months</span></p>
                <p className="text-xs text-muted-foreground mt-1">$45/month • Billed every 6 months</p>
              </div>
              <Button 
                onClick={() => handleSubscribe("six_month")} 
                disabled={isCreatingCheckout || isCurrentPlan("six_month")}
                variant={isCurrentPlan("six_month") ? "secondary" : "default"}
              >
                {getButtonText("six_month")}
              </Button>
            </div>

            {/* Annual Plan */}
            <div className={`border rounded-lg p-4 flex items-center justify-between ${isCurrentPlan("annual") ? "border-primary border-2 bg-primary/5" : "border-2 border-primary/50"}`}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold">Annual Plan</p>
                  <Badge className="bg-primary">Save 16%</Badge>
                  {isCurrentPlan("annual") && <Badge variant="outline" className="bg-primary text-primary-foreground">Current</Badge>}
                </div>
                <p className="text-2xl font-bold text-primary">$499.99<span className="text-sm text-muted-foreground">/year</span></p>
                <p className="text-xs text-muted-foreground mt-1">$41.67/month • Best value</p>
              </div>
              <Button 
                onClick={() => handleSubscribe("annual")} 
                disabled={isCreatingCheckout || isCurrentPlan("annual")}
                variant={isCurrentPlan("annual") ? "secondary" : "default"}
              >
                {getButtonText("annual")}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground mt-2">
              <p>✓ All plans include a 90-day free trial</p>
              <p>✓ $25 match fee applies per TLA (paid by load owner)</p>
              <p>✓ Cancel anytime before trial ends - no charge</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
