import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

export default function BillingPage() {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="grid gap-6">
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="font-headline">Subscription</CardTitle>
            <CardDescription>
              Your current plan and billing cycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Plan</p>
              <p className="text-lg font-semibold text-primary">Pro Plan</p>
            </div>
            <div className="space-y-1">
                <p className="text-sm font-medium">Price</p>
                <p className="text-lg font-semibold">$50.00 / month</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Next Billing Date</p>
              <p className="text-muted-foreground">September 1, 2024</p>
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <Button asChild>
                <Link href="/dashboard/billing/manage-payment">Manage Payment</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="font-headline">Billing History</CardTitle>
            <CardDescription>
              A record of all your charges and payments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    No billing history yet. Your charges will appear here once you have transactions.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
