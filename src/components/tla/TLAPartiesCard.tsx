import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { User, Mail } from "lucide-react";
import type { TLA } from "@/lib/data";

interface TLAPartiesCardProps {
  tla: TLA;
  isLessor: boolean;
  isLessee: boolean;
}

export function TLAPartiesCard({ tla, isLessor, isLessee }: TLAPartiesCardProps) {
  // Only show for signed or later stages
  if (!['signed', 'in_progress', 'completed'].includes(tla.status)) {
    return null;
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Parties
          </CardTitle>
          <CardDescription>Companies involved in this agreement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLessor && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
              <p className="text-xs text-muted-foreground">Load Owner (Lessee)</p>
              <p className="font-semibold">{tla.lessee.legalName}</p>
              {tla.lessee.contactEmail && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 cursor-help">
                      <Mail className="h-3 w-3" />
                      <span className="truncate max-w-[180px]">{tla.lessee.contactEmail}</span>
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{tla.lessee.contactEmail}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}

          {isLessee && (
            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                <p className="text-xs text-muted-foreground">Driver Owner (Lessor)</p>
                <p className="font-semibold">{tla.lessor.legalName}</p>
                {tla.lessor.contactEmail && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 cursor-help">
                        <Mail className="h-3 w-3" />
                        <span className="truncate max-w-[180px]">{tla.lessor.contactEmail}</span>
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{tla.lessor.contactEmail}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Driver</p>
                <p className="font-semibold">{tla.driver.name}</p>
              </div>
            </div>
          )}

          {isLessor && isLessee && (
            <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
              <p>You are both the lessor and lessee in this agreement (testing mode).</p>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
