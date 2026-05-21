/**
 * Transportation Node Catalog (DEV-155 MVP — Boston area).
 *
 * A "node" is a known transportation location with a stable identity, not
 * just an address: ports, distribution centers, rail ramps, intermodal
 * yards, cross-docks, etc. Matching against nodes (instead of free-text
 * addresses) lets us:
 *   - prefer drivers who routinely work that node (corridor familiarity),
 *   - know about access requirements (TWIC, chassis pool, hazmat),
 *   - estimate dwell time better,
 *   - group origin+destination into "corridors" for predictable lanes.
 *
 * This file is the MVP: ~10 hand-curated Boston-area nodes, a small set
 * of corridors that connect them, an address→node resolver, and pure
 * scoring helpers. Nothing in this file is wired into the production
 * matching engine yet — Phase 2 of node-based matching would call
 * `nodeProximityScore` / `corridorFamiliarityScore` from src/lib/matching.ts.
 *
 * Coordinates are approximate (terminal/main entry); fine for a 5-mile
 * resolver radius.
 */

export type NodeType =
  | 'port'         // marine container terminal
  | 'rail_ramp'    // intermodal rail yard
  | 'dc'           // distribution center
  | 'cross_dock'   // smaller cross-dock facility
  | 'air_cargo'    // airport cargo facility
  | 'yard';        // drop yard, chassis depot, terminal yard

export interface NodeAttributes {
  /** Transportation Worker Identification Credential required for entry. */
  twicRequired?: boolean;
  /** On-site chassis pool for drayage operations. */
  chassisPool?: boolean;
  hazmatAllowed?: boolean;
  appointmentRequired?: boolean;
  /** Free-text operating hours (display only for MVP). */
  operatingHours?: string;
}

export interface TransportNode {
  id: string;
  name: string;
  type: NodeType;
  /** Operating company / authority where applicable. */
  operator?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  attributes?: NodeAttributes;
  /** Alternate names searched against free-text addresses. */
  aliases?: string[];
}

export type CorridorType = 'drayage' | 'shuttle' | 'linehaul' | 'regional';

export interface Corridor {
  id: string;
  name: string;
  type: CorridorType;
  /** Origin node ids (typically a port, rail ramp, or supplier DC). */
  fromNodeIds: string[];
  /** Destination node ids (typically retailer DCs or cross-docks). */
  toNodeIds: string[];
  /** Average one-way trip distance in miles, for capacity planning. */
  approxMiles?: number;
  description?: string;
}

/**
 * Hand-curated Boston-area nodes. Real facilities; coordinates approximate.
 * Grow this list as corridors are formalized — keep the curation manual
 * until volume justifies a sourced/contracted catalog.
 */
export const BOSTON_NODES: TransportNode[] = [
  {
    id: 'NODE_PORT_BOSTON_CONLEY',
    name: 'Conley Container Terminal',
    type: 'port',
    operator: 'Massport',
    address: '799 Summer St',
    city: 'Boston',
    state: 'MA',
    zip: '02127',
    lat: 42.3413,
    lng: -71.0244,
    attributes: {
      twicRequired: true,
      chassisPool: true,
      hazmatAllowed: true,
      appointmentRequired: true,
      operatingHours: 'Mon–Fri 06:00–17:00',
    },
    aliases: ['Conley Terminal', 'Boston Port', 'Castle Island Terminal', 'Massport Conley'],
  },
  {
    id: 'NODE_AIR_BOSTON_LOGAN_CARGO',
    name: 'Logan Airport Cargo',
    type: 'air_cargo',
    operator: 'Massport',
    address: '1 Harborside Dr',
    city: 'East Boston',
    state: 'MA',
    zip: '02128',
    lat: 42.3656,
    lng: -71.0096,
    attributes: {
      appointmentRequired: true,
      operatingHours: '24/7',
    },
    aliases: ['Logan Cargo', 'BOS Cargo', 'Logan Air Cargo'],
  },
  {
    id: 'NODE_RAIL_WORCESTER_CSX',
    name: 'CSX Worcester Intermodal Terminal',
    type: 'rail_ramp',
    operator: 'CSX',
    address: '425 Franklin St',
    city: 'Worcester',
    state: 'MA',
    zip: '01604',
    lat: 42.2541,
    lng: -71.7754,
    attributes: {
      chassisPool: true,
      appointmentRequired: true,
      operatingHours: 'Mon–Sat 06:00–22:00',
    },
    aliases: ['CSX Worcester', 'Worcester Ramp', 'CSX Intermodal Worcester'],
  },
  {
    id: 'NODE_RAIL_AYER_NORFOLK_SOUTHERN',
    name: 'Ayer Intermodal Terminal',
    type: 'rail_ramp',
    operator: 'Pan Am Southern',
    address: '100 Willow Rd',
    city: 'Ayer',
    state: 'MA',
    zip: '01432',
    lat: 42.5601,
    lng: -71.5912,
    attributes: {
      chassisPool: true,
      appointmentRequired: true,
    },
    aliases: ['Ayer Ramp', 'Pan Am Ayer', 'Ayer Intermodal'],
  },
  {
    id: 'NODE_DC_AMAZON_BOS5_STOUGHTON',
    name: 'Amazon BOS5',
    type: 'dc',
    operator: 'Amazon',
    address: '301 Constitution Blvd',
    city: 'Stoughton',
    state: 'MA',
    zip: '02072',
    lat: 42.1126,
    lng: -71.0762,
    attributes: {
      appointmentRequired: true,
      operatingHours: '24/7',
    },
    aliases: ['BOS5', 'Amazon Stoughton', 'Amazon BOS5'],
  },
  {
    id: 'NODE_DC_AMAZON_BOS7_FALL_RIVER',
    name: 'Amazon BOS7',
    type: 'dc',
    operator: 'Amazon',
    address: '1180 Innovation Way',
    city: 'Fall River',
    state: 'MA',
    zip: '02720',
    lat: 41.7327,
    lng: -71.1532,
    attributes: {
      appointmentRequired: true,
      operatingHours: '24/7',
    },
    aliases: ['BOS7', 'Amazon Fall River'],
  },
  {
    id: 'NODE_DC_WALMART_RAYNHAM',
    name: 'Walmart DC #6071',
    type: 'dc',
    operator: 'Walmart',
    address: '545 Paramount Dr',
    city: 'Raynham',
    state: 'MA',
    zip: '02767',
    lat: 41.9325,
    lng: -71.0540,
    attributes: {
      appointmentRequired: true,
    },
    aliases: ['Walmart Raynham', 'Walmart DC 6071', 'WMT 6071'],
  },
  {
    id: 'NODE_DC_STOP_SHOP_READVILLE',
    name: 'Stop & Shop Distribution Center',
    type: 'dc',
    operator: 'Stop & Shop',
    address: '1385 Hyde Park Ave',
    city: 'Readville',
    state: 'MA',
    zip: '02136',
    lat: 42.2390,
    lng: -71.1326,
    attributes: {
      appointmentRequired: true,
    },
    aliases: ['Stop and Shop Readville', 'S&S DC Boston', 'Stop & Shop Boston DC'],
  },
  {
    id: 'NODE_DC_TJX_WORCESTER',
    name: 'TJX Worcester Distribution',
    type: 'dc',
    operator: 'TJX',
    address: '3000 Worcester Center Blvd',
    city: 'Worcester',
    state: 'MA',
    zip: '01608',
    lat: 42.2625,
    lng: -71.8023,
    attributes: {
      appointmentRequired: true,
    },
    aliases: ['TJX Worcester', 'TJ Maxx Worcester DC'],
  },
  {
    id: 'NODE_YARD_EVERETT_CHASSIS',
    name: 'Everett Chassis Yard',
    type: 'yard',
    operator: 'TRAC Intermodal',
    address: '120 Beacham St',
    city: 'Everett',
    state: 'MA',
    zip: '02149',
    lat: 42.4032,
    lng: -71.0617,
    attributes: {
      chassisPool: true,
      operatingHours: 'Mon–Fri 06:00–18:00',
    },
    aliases: ['TRAC Everett', 'Everett Drop Yard'],
  },
];

/**
 * Boston-area corridors. Many-to-many: a corridor can have multiple origin
 * nodes (e.g. all rail ramps feeding the same regional DC cluster) and
 * multiple destination nodes.
 */
export const BOSTON_CORRIDORS: Corridor[] = [
  {
    id: 'CORRIDOR_BOSTON_DRAYAGE',
    name: 'Boston Port → Boston Metro DCs',
    type: 'drayage',
    fromNodeIds: ['NODE_PORT_BOSTON_CONLEY'],
    toNodeIds: [
      'NODE_DC_AMAZON_BOS5_STOUGHTON',
      'NODE_DC_AMAZON_BOS7_FALL_RIVER',
      'NODE_DC_WALMART_RAYNHAM',
      'NODE_DC_STOP_SHOP_READVILLE',
      'NODE_YARD_EVERETT_CHASSIS',
    ],
    approxMiles: 25,
    description: 'Container drayage from Conley Terminal to Boston-area DCs and yards.',
  },
  {
    id: 'CORRIDOR_WORCESTER_RAIL_TO_BOSTON',
    name: 'Worcester Rail → Boston Metro',
    type: 'shuttle',
    fromNodeIds: ['NODE_RAIL_WORCESTER_CSX', 'NODE_RAIL_AYER_NORFOLK_SOUTHERN'],
    toNodeIds: [
      'NODE_DC_AMAZON_BOS5_STOUGHTON',
      'NODE_DC_STOP_SHOP_READVILLE',
      'NODE_DC_WALMART_RAYNHAM',
      'NODE_YARD_EVERETT_CHASSIS',
    ],
    approxMiles: 50,
    description: 'Intermodal rail-to-DC shuttles from Worcester / Ayer ramps.',
  },
  {
    id: 'CORRIDOR_LOGAN_AIR_CARGO',
    name: 'Logan Cargo → Regional DCs',
    type: 'shuttle',
    fromNodeIds: ['NODE_AIR_BOSTON_LOGAN_CARGO'],
    toNodeIds: [
      'NODE_DC_AMAZON_BOS5_STOUGHTON',
      'NODE_DC_TJX_WORCESTER',
      'NODE_DC_STOP_SHOP_READVILLE',
    ],
    approxMiles: 35,
    description: 'Time-critical air cargo shuttles ex-Logan to retail DCs.',
  },
];

// --- Pure helpers ----------------------------------------------------------

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in miles. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface NodeMatch {
  node: TransportNode;
  /** Distance in miles from input to node. */
  distanceMiles: number;
  /**
   * 'alias' = matched by name string in the input,
   * 'proximity' = matched by lat/lng within radius,
   * 'mixed' = both signals agreed.
   */
  matchedBy: 'alias' | 'proximity' | 'mixed';
}

/** Strip + lowercase for alias comparison. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a free-text address (and optional lat/lng) to the nearest known
 * node. Returns null if no node is within radiusMiles AND no alias matches.
 *
 * Pass coords when available — we don't geocode in this MVP. (A production
 * version would call the existing geocodeLocation helper from matching.ts
 * before falling back to alias matching.)
 */
export function resolveAddressToNode(opts: {
  address: string;
  coords?: { lat: number; lng: number };
  catalog?: TransportNode[];
  radiusMiles?: number;
}): NodeMatch | null {
  const catalog = opts.catalog ?? BOSTON_NODES;
  const radius = opts.radiusMiles ?? 5;
  const text = normalize(opts.address);

  // 1) Alias match — strong signal even without coordinates.
  const aliasHit = catalog.find(n => {
    if (text.includes(normalize(n.name))) return true;
    if (n.aliases?.some(a => text.includes(normalize(a)))) return true;
    return false;
  });

  // 2) Proximity match if we have coords.
  let nearest: { node: TransportNode; distanceMiles: number } | null = null;
  if (opts.coords) {
    for (const n of catalog) {
      const d = haversineMiles(opts.coords, { lat: n.lat, lng: n.lng });
      if (!nearest || d < nearest.distanceMiles) nearest = { node: n, distanceMiles: d };
    }
  }

  if (aliasHit && nearest && nearest.node.id === aliasHit.id) {
    return { node: aliasHit, distanceMiles: nearest.distanceMiles, matchedBy: 'mixed' };
  }
  if (aliasHit) {
    const distanceMiles = opts.coords
      ? haversineMiles(opts.coords, { lat: aliasHit.lat, lng: aliasHit.lng })
      : 0;
    return { node: aliasHit, distanceMiles, matchedBy: 'alias' };
  }
  if (nearest && nearest.distanceMiles <= radius) {
    return { node: nearest.node, distanceMiles: nearest.distanceMiles, matchedBy: 'proximity' };
  }
  return null;
}

/**
 * Find a corridor that connects an origin and destination node, if any.
 * Returns the most specific matching corridor (membership in both lists)
 * or null if no defined corridor connects the two nodes.
 */
export function resolveCorridor(
  fromNodeId: string,
  toNodeId: string,
  catalog: Corridor[] = BOSTON_CORRIDORS,
): Corridor | null {
  return (
    catalog.find(c => c.fromNodeIds.includes(fromNodeId) && c.toNodeIds.includes(toNodeId)) ??
    null
  );
}

// --- Scoring helpers -------------------------------------------------------
// Pure functions designed to plug into the existing matching engine when
// node-based matching is enabled. NOT yet called by src/lib/matching.ts.

/**
 * Node Proximity Score (0–100). Same node = 100, fall off with distance.
 *   ≤ 1 mi  → 100
 *   ≤ 5 mi  →  90
 *   ≤ 10 mi →  75
 *   ≤ 25 mi →  55
 *   ≤ 50 mi →  30
 *   > 50 mi →  10
 */
export function nodeProximityScore(distanceMiles: number): number {
  if (distanceMiles <= 1) return 100;
  if (distanceMiles <= 5) return 90;
  if (distanceMiles <= 10) return 75;
  if (distanceMiles <= 25) return 55;
  if (distanceMiles <= 50) return 30;
  return 10;
}

/**
 * Corridor Familiarity Score (0–100). Based on a driver's historical trip
 * count on the corridor. Caller supplies the count from their analytics.
 *
 *   ≥ 30 trips → 100
 *   10–29     →  80
 *    3–9      →  55
 *    1–2      →  30
 *    0        →   0
 */
export function corridorFamiliarityScore(historicalTrips: number): number {
  if (historicalTrips >= 30) return 100;
  if (historicalTrips >= 10) return 80;
  if (historicalTrips >= 3) return 55;
  if (historicalTrips >= 1) return 30;
  return 0;
}

/** Lookup by id (BOSTON_NODES + any future catalogs the caller passes in). */
export function getNodeById(
  id: string,
  catalog: TransportNode[] = BOSTON_NODES,
): TransportNode | undefined {
  return catalog.find(n => n.id === id);
}
