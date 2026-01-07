import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CreditCard } from 'lucide-react';

export default function ManagePaymentPage() {
  return (
    <div className="grid gap-6">
      <Card className="mx-auto w-full max-w-lg">
        <CardHeader>
          <CardTitle className="font-headline">Manage Payment Method</CardTitle>
          <CardDescription>
            Update your payment information or add a new card.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className='flex items-center gap-4'>
                    <CreditCard className="h-8 w-8 text-muted-foreground" />
                    <div>
                        <p className="font-semibold">Visa ending in 4242</p>
                        <p className="text-sm text-muted-foreground">Expires 12/2028</p>
                    </div>
                </div>
                <Button variant="outline" size="sm">Remove</Button>
            </div>
             <Button className="w-full">Add New Card</Button>
        </CardContent>
      </Card>
       <div className="text-center">
            <Button asChild variant="link">
                <Link href="/dashboard/billing">Back to Billing</Link>
            </Button>
      </div>
    </div>
  );
}
