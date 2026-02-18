/**
 * Standard Load Types for freight classification
 * Used in load creation form as a dropdown
 */
export const LOAD_TYPES = [
  { value: "general-freight", label: "General Freight", description: "Mixed or unspecified goods" },
  { value: "household-goods", label: "Household Goods", description: "Furniture, appliances, personal items" },
  { value: "building-materials", label: "Building Materials", description: "Lumber, drywall, concrete, steel" },
  { value: "machinery", label: "Machinery & Equipment", description: "Industrial machinery, heavy equipment" },
  { value: "electronics", label: "Electronics", description: "Computers, servers, consumer electronics" },
  { value: "food-dry", label: "Food (Dry/Non-Perishable)", description: "Canned goods, packaged food, grains" },
  { value: "food-refrigerated", label: "Food (Refrigerated)", description: "Produce, dairy, frozen goods" },
  { value: "beverages", label: "Beverages", description: "Water, juice, soft drinks, alcohol" },
  { value: "automotive-parts", label: "Automotive Parts", description: "Vehicle parts and accessories" },
  { value: "vehicles", label: "Vehicles", description: "Cars, trucks, motorcycles" },
  { value: "chemicals", label: "Chemicals", description: "Industrial chemicals, cleaning supplies" },
  { value: "hazardous-materials", label: "Hazardous Materials", description: "Flammable, corrosive, or toxic cargo" },
  { value: "petroleum", label: "Petroleum & Fuel", description: "Gasoline, diesel, oil products" },
  { value: "paper-products", label: "Paper Products", description: "Paper, cardboard, packaging" },
  { value: "textiles", label: "Textiles & Apparel", description: "Clothing, fabric, raw textiles" },
  { value: "agricultural", label: "Agricultural Products", description: "Grain, feed, seeds, fertilizer" },
  { value: "livestock", label: "Livestock", description: "Cattle, poultry, other animals" },
  { value: "lumber", label: "Lumber & Forest Products", description: "Raw timber, plywood, wood products" },
  { value: "metal-products", label: "Metal Products", description: "Steel coils, pipes, metal fabrications" },
  { value: "medical-supplies", label: "Medical Supplies", description: "Pharmaceuticals, medical equipment" },
  { value: "retail-goods", label: "Retail Goods", description: "Consumer products for stores" },
  { value: "construction-equipment", label: "Construction Equipment", description: "Excavators, cranes, heavy machinery" },
  { value: "waste-recycling", label: "Waste & Recycling", description: "Scrap, recyclable materials, waste" },
  { value: "oversize-load", label: "Oversize/Overweight Load", description: "Loads requiring special permits" },
  { value: "other", label: "Other", description: "Custom or specialized cargo" },
] as const;

export type LoadType = typeof LOAD_TYPES[number]['value'];

/**
 * CDL Class requirements for loads
 */
export const CDL_CLASSES = [
  { value: "A", label: "Class A", description: "Combination vehicles over 26,001 lbs GCWR" },
  { value: "B", label: "Class B", description: "Single vehicles over 26,001 lbs GVWR" },
  { value: "C", label: "Class C", description: "Vehicles transporting hazmat or 16+ passengers" },
] as const;

export type CDLClass = typeof CDL_CLASSES[number]['value'];

/**
 * Endorsement requirements for loads
 */
export const LOAD_ENDORSEMENTS = [
  { value: "H", label: "Hazmat", description: "Hazardous materials" },
  { value: "N", label: "Tanker", description: "Tank vehicles" },
  { value: "T", label: "Doubles/Triples", description: "Double/triple trailers" },
] as const;

export type LoadEndorsement = typeof LOAD_ENDORSEMENTS[number]['value'];

/**
 * Load status states
 */
export const LOAD_STATUSES = [
  { value: "draft", label: "Draft", color: "secondary" },
  { value: "live", label: "Live", color: "default" },
  { value: "match_pending", label: "Match Pending", color: "outline" },
  { value: "driver_matched", label: "Driver Matched", color: "default" },
  { value: "in_progress", label: "In Progress", color: "default" },
  { value: "completed", label: "Completed", color: "secondary" },
  { value: "cancelled", label: "Cancelled", color: "destructive" },
] as const;

export type LoadStatus = typeof LOAD_STATUSES[number]['value'];

/**
 * Check if a load status allows full editing
 */
export function isFullyEditable(status: LoadStatus): boolean {
  return status === 'draft' || status === 'live';
}

/**
 * Check if a load status allows limited editing (notes only)
 */
export function isLimitedEditable(status: LoadStatus): boolean {
  return status === 'match_pending';
}

/**
 * Check if a load can be deleted (hard delete for draft, cancel for others)
 */
export function canDelete(status: LoadStatus): boolean {
  return status === 'draft';
}

/**
 * Check if a load can be cancelled
 */
export function canCancel(status: LoadStatus): boolean {
  return ['live', 'match_pending'].includes(status);
}
