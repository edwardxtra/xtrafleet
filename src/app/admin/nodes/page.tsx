'use client';

/**
 * DEV-155 nodes MVP — preview page.
 *
 * Lets you see the hand-curated Boston-area transport-node catalog and
 * play with the address → node resolver and corridor matcher without
 * touching the production matching engine.
 */

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MapPin, Anchor, Train, Warehouse, PackageCheck, Plane, ArrowRight, Route } from 'lucide-react';
import {
  BOSTON_NODES,
  BOSTON_CORRIDORS,
  resolveAddressToNode,
  resolveCorridor,
  nodeProximityScore,
  corridorFamiliarityScore,
  getNodeById,
  type NodeMatch,
  type Corridor,
  type NodeType,
} from '@/lib/nodes';

const TYPE_ICON: Record<NodeType, React.ComponentType<{ className?: string }>> = {
  port: Anchor,
  rail_ramp: Train,
  dc: Warehouse,
  cross_dock: PackageCheck,
  air_cargo: Plane,
  yard: MapPin,
};

const TYPE_LABEL: Record<NodeType, string> = {
  port: 'Port',
  rail_ramp: 'Rail Ramp',
  dc: 'Distribution Center',
  cross_dock: 'Cross-Dock',
  air_cargo: 'Air Cargo',
  yard: 'Yard',
};

interface ResolveResult {
  origin: NodeMatch | null;
  destination: NodeMatch | null;
  corridor: Corridor | null;
  scores: {
    originProximity: number;
    destinationProximity: number;
    corridorFamiliarityIfFiveTrips: number;
  } | null;
}

export default function AdminNodesPage() {
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [originLat, setOriginLat] = useState('');
  const [originLng, setOriginLng] = useState('');
  const [destLat, setDestLat] = useState('');
  const [destLng, setDestLng] = useState('');
  const [result, setResult] = useState<ResolveResult | null>(null);

  const handleResolve = () => {
    const oCoords = originLat && originLng ? { lat: +originLat, lng: +originLng } : undefined;
    const dCoords = destLat && destLng ? { lat: +destLat, lng: +destLng } : undefined;
    const origin = originText
      ? resolveAddressToNode({ address: originText, coords: oCoords })
      : null;
    const destination = destText
      ? resolveAddressToNode({ address: destText, coords: dCoords })
      : null;
    const corridor =
      origin && destination ? resolveCorridor(origin.node.id, destination.node.id) : null;
    const scores =
      origin && destination
        ? {
            originProximity: nodeProximityScore(origin.distanceMiles),
            destinationProximity: nodeProximityScore(destination.distanceMiles),
            // Demo value — real callers pass the driver's historical trip count.
            corridorFamiliarityIfFiveTrips: corridorFamiliarityScore(5),
          }
        : null;
    setResult({ origin, destination, corridor, scores });
  };

  const sortedNodes = useMemo(
    () => [...BOSTON_NODES].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Route className="h-6 w-6" />
          Transport Node Catalog
        </h1>
        <p className="text-muted-foreground">
          DEV-155 MVP. Hand-curated Boston-area nodes + corridors. Not yet wired into the production matching engine — this page is for previewing what node-based matching would resolve.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resolve a Trip</CardTitle>
          <CardDescription>
            Paste pickup / delivery addresses (or alias text like &quot;Conley Terminal&quot;) and optional lat/lng. The resolver matches by alias first, then by proximity within 5 miles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="origin">Pickup address</Label>
              <Input
                id="origin"
                value={originText}
                onChange={e => setOriginText(e.target.value)}
                placeholder="e.g., Conley Terminal, Boston MA"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input value={originLat} onChange={e => setOriginLat(e.target.value)} placeholder="lat (optional)" />
                <Input value={originLng} onChange={e => setOriginLng(e.target.value)} placeholder="lng (optional)" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dest">Delivery address</Label>
              <Input
                id="dest"
                value={destText}
                onChange={e => setDestText(e.target.value)}
                placeholder="e.g., Amazon BOS5 Stoughton MA"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input value={destLat} onChange={e => setDestLat(e.target.value)} placeholder="lat (optional)" />
                <Input value={destLng} onChange={e => setDestLng(e.target.value)} placeholder="lng (optional)" />
              </div>
            </div>
          </div>
          <Button onClick={handleResolve}>Resolve</Button>

          {result && (
            <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ResolveColumn label="Pickup" match={result.origin} />
                <div className="flex items-center justify-center text-muted-foreground">
                  <ArrowRight className="h-6 w-6" />
                </div>
                <ResolveColumn label="Delivery" match={result.destination} />
              </div>

              {result.corridor ? (
                <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-3">
                  <p className="font-medium flex items-center gap-2">
                    <Route className="h-4 w-4" /> Corridor: {result.corridor.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Type: {result.corridor.type}
                    {result.corridor.approxMiles && <> · ~{result.corridor.approxMiles} mi</>}
                    {result.corridor.description && <> · {result.corridor.description}</>}
                  </p>
                </div>
              ) : result.origin && result.destination ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
                  No defined corridor connects these two nodes yet — would fall back to address-based scoring in production.
                </div>
              ) : null}

              {result.scores && (
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Sample scores (0–100)</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Pickup proximity</p>
                      <p className="font-mono text-lg">{result.scores.originProximity}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Delivery proximity</p>
                      <p className="font-mono text-lg">{result.scores.destinationProximity}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Corridor familiarity (5 trips)</p>
                      <p className="font-mono text-lg">{result.scores.corridorFamiliarityIfFiveTrips}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catalog ({BOSTON_NODES.length} nodes)</CardTitle>
          <CardDescription>Hand-curated. Grow as new corridors are formalized.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>City / State</TableHead>
                <TableHead>Attributes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedNodes.map(n => {
                const Icon = TYPE_ICON[n.type];
                return (
                  <TableRow key={n.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <Icon className="h-3.5 w-3.5" />
                        {TYPE_LABEL[n.type]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{n.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{n.id}</div>
                    </TableCell>
                    <TableCell className="text-sm">{n.operator || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {n.city}, {n.state}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {n.attributes?.twicRequired && <Badge variant="outline" className="text-xs">TWIC</Badge>}
                        {n.attributes?.chassisPool && <Badge variant="outline" className="text-xs">Chassis</Badge>}
                        {n.attributes?.hazmatAllowed && <Badge variant="outline" className="text-xs">Hazmat</Badge>}
                        {n.attributes?.appointmentRequired && <Badge variant="outline" className="text-xs">Appt</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Corridors ({BOSTON_CORRIDORS.length})</CardTitle>
          <CardDescription>Many-to-many node groupings used for familiarity scoring.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {BOSTON_CORRIDORS.map(c => (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{c.name}</p>
                <Badge variant="secondary" className="text-xs">{c.type}</Badge>
              </div>
              {c.description && (
                <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 text-xs">
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide">From</p>
                  <ul className="mt-1 space-y-0.5">
                    {c.fromNodeIds.map(id => {
                      const n = getNodeById(id);
                      return <li key={id}>{n?.name || id}</li>;
                    })}
                  </ul>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide">To</p>
                  <ul className="mt-1 space-y-0.5">
                    {c.toNodeIds.map(id => {
                      const n = getNodeById(id);
                      return <li key={id}>{n?.name || id}</li>;
                    })}
                  </ul>
                </div>
              </div>
              {c.approxMiles && (
                <p className="text-xs text-muted-foreground mt-2">~{c.approxMiles} mi typical one-way</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ResolveColumn({ label, match }: { label: string; match: NodeMatch | null }) {
  if (!match) {
    return (
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm text-muted-foreground italic mt-1">No node matched within 5 mi</p>
      </div>
    );
  }
  const Icon = TYPE_ICON[match.node.type];
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-primary" />
        <p className="font-medium text-sm">{match.node.name}</p>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 font-mono">{match.node.id}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {match.distanceMiles.toFixed(1)} mi · matched by {match.matchedBy}
      </p>
    </div>
  );
}
