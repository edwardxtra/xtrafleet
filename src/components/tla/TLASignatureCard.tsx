import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, User, Calendar, MapPin, Monitor } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TLA } from "@/lib/data";
import { parseUserAgent } from "@/lib/audit-utils";

interface TLASignatureCardProps {
  tla: TLA;
}

export function TLASignatureCard({ tla }: TLASignatureCardProps) {
  const lessorSigned = !!tla.lessorSignature;
  const lesseeSigned = !!tla.lesseeSignature;
  const bothSigned = lessorSigned && lesseeSigned;

  const formatSignatureDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return dateString;
    }
  };

  const renderSignatureDetails = (signature: any, role: 'Lessor' | 'Lessee') => {
    if (!signature) {
      return (
        <div className="text-sm text-muted-foreground">
          Waiting for {role} signature
        </div>
      );
    }

    const deviceInfo = signature.userAgent ? parseUserAgent(signature.userAgent) : null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="font-medium text-sm">Signed</span>
        </div>
        
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <User className="h-3 w-3" />
            <span>{signature.signedByName}</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            <span>{formatSignatureDate(signature.signedAt)}</span>
          </div>

          {signature.ipAddress && signature.ipAddress !== 'unknown' && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              <span>IP: {signature.ipAddress}</span>
            </div>
          )}

          {deviceInfo && (
            <div className="flex items-center gap-1.5">
              <Monitor className="h-3 w-3" />
              <span>{deviceInfo.browser} on {deviceInfo.os}</span>
            </div>
          )}

          {signature.consentToEsign && (
            <div className="mt-2 text-xs text-green-600">
              ✓ Consented to electronic signature
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Signatures</span>
          {bothSigned && (
            <Badge variant="default" className="bg-green-600">
              Fully Signed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lessor Signature */}
        <div>
          <div className="text-sm font-medium mb-2">Lessor (Driver Provider)</div>
          {renderSignatureDetails(tla.lessorSignature, 'Lessor')}
        </div>

        <div className="border-t" />

        {/* Lessee Signature */}
        <div>
          <div className="text-sm font-medium mb-2">Lessee (Hiring Carrier)</div>
          {renderSignatureDetails(tla.lesseeSignature, 'Lessee')}
        </div>

        {bothSigned && (
          <>
            <div className="border-t" />
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              <p className="font-medium mb-1">Legal Verification</p>
              <p>
                This agreement was signed electronically in accordance with the ESIGN Act and UETA. 
                Both parties consented to electronic signatures and a complete audit trail has been recorded.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
