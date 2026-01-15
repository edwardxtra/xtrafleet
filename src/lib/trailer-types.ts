/**
 * Common Trailer Body Types for the trucking industry
 * Based on standard FMCSA classifications
 */
export const TRAILER_TYPES = [
  {
    value: "dry-van",
    label: "Dry Van",
    description: "Enclosed, all-purpose trailer"
  },
  {
    value: "reefer",
    label: "Reefer (Refrigerated)",
    description: "Insulated trailer for temperature-sensitive goods"
  },
  {
    value: "flatbed",
    label: "Flatbed",
    description: "Open deck for oversized or oddly shaped loads with straps/chains"
  },
  {
    value: "step-deck",
    label: "Step Deck (Drop Deck)",
    description: "A flatbed with lower deck for taller loads without height clearance issues"
  },
  {
    value: "tanker",
    label: "Tanker",
    description: "Cylindrical tanks for liquids"
  },
  {
    value: "lowboy",
    label: "Lowboy",
    description: "A very low-deck trailer for heavy equipment or construction machinery"
  },
  {
    value: "box-truck",
    label: "Box Truck",
    description: "A single unit with a cargo box attached to the cab for local deliveries"
  },
  {
    value: "conestoga",
    label: "Conestoga",
    description: "Flatbed with a rolling tarp system"
  },
  {
    value: "double-drop",
    label: "Double Drop",
    description: "Two-level lowboy for extra-tall cargo"
  },
  {
    value: "removable-gooseneck",
    label: "RGN (Removable Gooseneck)",
    description: "Detachable front for easy loading of heavy equipment"
  },
  {
    value: "auto-carrier",
    label: "Auto Carrier",
    description: "Multi-level trailer for transporting vehicles"
  },
  {
    value: "dump-truck",
    label: "Dump Truck",
    description: "Hydraulic bed for dumping bulk materials"
  },
  {
    value: "hopper",
    label: "Hopper",
    description: "Specialized trailer for bulk dry goods"
  },
  {
    value: "pneumatic",
    label: "Pneumatic",
    description: "Uses air pressure to unload bulk powders"
  },
  {
    value: "livestock",
    label: "Livestock Trailer",
    description: "Ventilated trailer for transporting animals"
  },
  {
    value: "stretch",
    label: "Stretch Trailer",
    description: "Extendable trailer for extra-long loads"
  },
  {
    value: "side-kit",
    label: "Side Kit Trailer",
    description: "Removable sides for flexible loading"
  },
  {
    value: "b-train",
    label: "B-Train",
    description: "Two trailers coupled together"
  },
  {
    value: "intermodal",
    label: "Intermodal Container",
    description: "Standardized shipping containers"
  },
  {
    value: "other",
    label: "Other",
    description: "Custom or specialized trailer type"
  }
] as const;

export type TrailerType = typeof TRAILER_TYPES[number]['value'];
