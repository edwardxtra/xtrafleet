import { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null; // 'trialing', 'active', 'past_due', 'canceled', etc.
  planType: string | null; // 'monthly', 'six_month', 'annual'
  trialEndsAt: string | null;
  subscriptionPeriodEnd: string | null;
  daysUntilTrialEnd: number | null;
  isInTrial: boolean;
  isPastDue: boolean;
  isCanceled: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export function useSubscription() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [subscription, setSubscription] = useState<SubscriptionStatus>({
    hasActiveSubscription: false,
    subscriptionStatus: null,
    planType: null,
    trialEndsAt: null,
    subscriptionPeriodEnd: null,
    daysUntilTrialEnd: null,
    isInTrial: false,
    isPastDue: false,
    isCanceled: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !firestore) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(firestore, `owner_operators/${user.uid}`),
      (doc) => {
        if (!doc.exists()) {
          setIsLoading(false);
          return;
        }

        const data = doc.data();
        const subscriptionStatus = data.subscriptionStatus || null;
        const trialEndsAt = data.trialEndsAt || null;

        // Calculate days until trial end
        let daysUntilTrialEnd = null;
        if (trialEndsAt) {
          const trialEndDate = new Date(trialEndsAt);
          const now = new Date();
          const diffTime = trialEndDate.getTime() - now.getTime();
          daysUntilTrialEnd = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        const hasActiveSubscription =
          subscriptionStatus === 'trialing' ||
          subscriptionStatus === 'active';

        setSubscription({
          hasActiveSubscription,
          subscriptionStatus,
          planType: data.subscriptionPlanType || null,
          trialEndsAt,
          subscriptionPeriodEnd: data.subscriptionPeriodEnd || null,
          daysUntilTrialEnd,
          isInTrial: subscriptionStatus === 'trialing',
          isPastDue: subscriptionStatus === 'past_due',
          isCanceled: subscriptionStatus === 'canceled',
          stripeCustomerId: data.stripeCustomerId || null,
          stripeSubscriptionId: data.stripeSubscriptionId || null,
        });

        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching subscription:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, firestore]);

  return { subscription, isLoading };
}
