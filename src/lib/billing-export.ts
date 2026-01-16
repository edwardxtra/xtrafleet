/**
 * Utility functions for exporting billing data to CSV
 */

import { format } from 'date-fns';

interface Payment {
  id: string;
  type: 'monthly_subscription' | 'match_fee' | 'load_delivery_fee';
  amount: number;
  status: 'succeeded' | 'pending' | 'failed' | 'refunded';
  createdAt: any;
  description?: string;
  loadId?: string;
  matchId?: string;
  refundReason?: string;
  refundDetails?: string;
}

interface OwnerOperator {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
}

/**
 * Convert payments array to CSV format
 */
export function paymentsToCSV(payments: Payment[], ownerOperator?: OwnerOperator): string {
  // CSV Headers
  const headers = [
    'Date',
    'Type',
    'Description',
    'Amount',
    'Status',
    'Load ID',
    'Match ID',
    'Refund Reason',
    'Refund Details',
  ];

  // Add owner operator info if provided
  if (ownerOperator) {
    headers.unshift('Owner Operator', 'Company', 'Email');
  }

  const rows = payments.map((payment) => {
    const date = payment.createdAt?.toDate
      ? format(payment.createdAt.toDate(), 'yyyy-MM-dd HH:mm:ss')
      : 'N/A';

    const amount = (payment.amount / 100).toFixed(2);
    const type = payment.type.replace('_', ' ');

    const row = [
      date,
      type,
      payment.description || '',
      `$${amount}`,
      payment.status,
      payment.loadId || '',
      payment.matchId || '',
      payment.refundReason || '',
      payment.refundDetails || '',
    ];

    // Add owner operator info if provided
    if (ownerOperator) {
      const name = [ownerOperator.firstName, ownerOperator.lastName]
        .filter(Boolean)
        .join(' ') || 'N/A';
      row.unshift(name, ownerOperator.companyName || '', ownerOperator.email);
    }

    return row;
  });

  // Escape CSV values (handle commas and quotes)
  const escapeCSV = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  // Build CSV
  const csvRows = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ];

  return csvRows.join('\n');
}

/**
 * Download CSV file
 */
export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export billing history for a specific owner operator
 */
export function exportOwnerOperatorBilling(
  payments: Payment[],
  ownerOperator: OwnerOperator
) {
  const csv = paymentsToCSV(payments, ownerOperator);
  const filename = `billing-${ownerOperator.email}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  downloadCSV(csv, filename);
}

/**
 * Export all billing history (for admin reports)
 */
export function exportAllBilling(payments: Payment[]) {
  const csv = paymentsToCSV(payments);
  const filename = `all-billing-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  downloadCSV(csv, filename);
}
