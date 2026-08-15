export type CourierChargesConfig = {
  enabled: boolean;
  tamilNaduBase: number;
  southStatesBase: number;
  restOfIndiaBase: number;
  qty2To4AddOn: number;
  qty5PlusFlat: number;
  /** When true, courier is ₹0 if orderAmount >= freeShippingMin. */
  freeShippingEnabled: boolean;
  /** Discounted merchandise subtotal threshold (rupees, integer). */
  freeShippingMin: number;
  gstEnabled: boolean;
  gstPercentage: number;
};

export type CourierChargeBreakdown = {
  state: string;
  normalizedState: string;
  quantity: number;
  charge: number;
  ruleApplied:
    | "free_shipping"
    | "no_physical_items"
    | "qty1_base"
    | "qty2_4_add_on"
    | "qty5_plus_flat";
  region: "tamil_nadu" | "south_states" | "rest_of_india";
};

const SOUTH_STATES = new Set([
  "karnataka",
  "andhra pradesh",
  "andhra",
  "telangana",
  "hyderabad",
  "kerala",
]);

export function normalizeStateForCourier(state: string): string {
  return state.toLowerCase().replace(/\s+/g, " ").trim();
}

export function calculateCourierCharge(params: {
  state: string;
  quantity: number;
  /** Discounted merchandise subtotal (after promo, before courier/GST). */
  orderAmount?: number;
  config: CourierChargesConfig;
}): CourierChargeBreakdown {
  const normalizedState = normalizeStateForCourier(params.state);
  const rawQuantity = Math.round(Number(params.quantity));
  const config = params.config;
  const isTamilNadu =
    normalizedState === "tamil nadu" || normalizedState === "tamilnadu";

  if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) {
    return {
      state: params.state,
      normalizedState,
      quantity: 0,
      charge: 0,
      ruleApplied: "no_physical_items",
      region: isTamilNadu
        ? "tamil_nadu"
        : SOUTH_STATES.has(normalizedState)
          ? "south_states"
          : "rest_of_india",
    };
  }

  const quantity = rawQuantity;

  const region: CourierChargeBreakdown["region"] = isTamilNadu
    ? "tamil_nadu"
    : SOUTH_STATES.has(normalizedState)
      ? "south_states"
      : "rest_of_india";

  const orderAmount = Number(params.orderAmount);
  const freeMin = Math.max(0, Math.round(Number(config.freeShippingMin) || 0));
  if (
    config.freeShippingEnabled &&
    Number.isFinite(orderAmount) &&
    orderAmount >= freeMin
  ) {
    return {
      state: params.state,
      normalizedState,
      quantity,
      charge: 0,
      ruleApplied: "free_shipping",
      region,
    };
  }

  const base =
    region === "tamil_nadu"
      ? config.tamilNaduBase
      : region === "south_states"
        ? config.southStatesBase
        : config.restOfIndiaBase;

  if (quantity >= 5) {
    return {
      state: params.state,
      normalizedState,
      quantity,
      charge: config.qty5PlusFlat,
      ruleApplied: "qty5_plus_flat",
      region,
    };
  }

  if (quantity >= 2) {
    return {
      state: params.state,
      normalizedState,
      quantity,
      charge: base + config.qty2To4AddOn,
      ruleApplied: "qty2_4_add_on",
      region,
    };
  }

  return {
    state: params.state,
    normalizedState,
    quantity,
    charge: base,
    ruleApplied: "qty1_base",
    region,
  };
}

export function calculateGstAmount(params: {
  taxableAmount: number;
  config: CourierChargesConfig;
}): number {
  if (!params.config.gstEnabled) return 0;
  const amount = Number(params.taxableAmount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const percentage = Math.max(0, Number(params.config.gstPercentage ?? 0));
  return Math.round(amount * percentage * 100) / 10000;
}
