import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Clock } from "lucide-react";
import type { TLA } from "@/lib/data";
import { formatTLADate } from "@/lib/tla-utils";

interface TLASignatureCardProps {
  tla: TLA;
}

export function TLASignatureCard({ tla }: TLASignatureCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Signatures</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lessor Signature */}
        <div className={`p-3 rounded-lg ${
          tla.lessorSignature 
            ? 'bg-green-50 dark:bg-green-950/20' 
            : 'bg-muted/50'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">Lessor (Driver Owner)</span>
            {tla.lessorSignature ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          {tla.lessorSignature ? (
            <div className="text-xs">
              <p className="font-medium">{tla.lessorSignature.signedByName}</p>
              <p className="text-muted-foreground">
                {formatTLADate(tla.lessorSignature.signedAt)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Awaiting signature</p>
          )}
        </div>

        {/* Lessee Signature */}
        <div className={`p-3 rounded-lg ${
          tla.lesseeSignature 
            ? 'bg-green-50 dark:bg-green-950/20' 
            : 'bg-muted/50'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">Lessee (Load Owner)</span>
            {tla.lesseeSignature ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          {tla.lesseeSignature ? (
            <div className="text-xs">
              <p className="font-medium">{tla.lesseeSignature.signedByName}</p>
              <p className="text-muted-foreground">
                {formatTLADate(tla.lesseeSignature.signedAt)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Awaiting signature</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
