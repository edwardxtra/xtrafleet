import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";

interface DriverStatusBadgeProps {
  profileStatus?: string;
  profileComplete?: boolean;
  className?: string;
}

export function DriverStatusBadge({ profileStatus, profileComplete, className }: DriverStatusBadgeProps) {
  if (!profileStatus || profileStatus === 'incomplete') {
    return (
      <Badge variant="secondary" className={className}>
        <AlertCircle className="h-3 w-3 mr-1" />
        Profile Incomplete
      </Badge>
    );
  }

  if (profileStatus === 'pending_confirmation') {
    return (
      <Badge variant="outline" className={`border-yellow-500 text-yellow-700 ${className}`}>
        <Clock className="h-3 w-3 mr-1" />
        Awaiting Confirmation
      </Badge>
    );
  }

  if (profileStatus === 'confirmed' && profileComplete) {
    return (
      <Badge variant="default" className={`bg-green-600 hover:bg-green-700 ${className}`}>
        <CheckCircle className="h-3 w-3 mr-1" />
        Eligible for Leasing
      </Badge>
    );
  }

  if (profileStatus === 'rejected') {
    return (
      <Badge variant="destructive" className={className}>
        <XCircle className="h-3 w-3 mr-1" />
        Rejected
      </Badge>
    );
  }

  return null;
}
