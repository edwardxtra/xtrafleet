import { Badge } from "@/components/ui/badge";
import type { TLA } from "@/lib/data";
import { getTLAStatusConfig } from "@/lib/tla-utils";

interface TLAStatusBadgeProps {
  status: TLA['status'];
}

export function TLAStatusBadge({ status }: TLAStatusBadgeProps) {
  const config = getTLAStatusConfig(status);
  const Icon = config.icon;
  
  return (
    <Badge variant={config.variant} className={config.className}>
      {Icon && <Icon className="h-3 w-3 mr-1" />}
      {config.label}
    </Badge>
  );
}
