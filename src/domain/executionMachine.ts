export type SwapState =
  | { step: "preview_ready" }
  | { step: "refreshing_quote" }
  | { step: "building_transaction" }
  | { step: "awaiting_signature" }
  | { step: "signing" }
  | { step: "submitting" }
  | { step: "submitted"; txHash: string; submittedAt: string }
  | { step: "tracking"; txHash: string; submittedAt: string }
  | { step: "confirmed"; txHash: string; blockHeight: number }
  | { step: "failed"; error: string }
  | { step: "expired"; error: string };

export type SwapAction =
  | { type: "START_REFRESH" }
  | { type: "START_BUILD" }
  | { type: "START_SIGN" }
  | { type: "START_SUBMIT" }
  | { type: "TX_SUBMITTED"; txHash: string }
  | { type: "TX_TRACKING"; txHash: string }
  | { type: "TX_CONFIRMED"; txHash: string; blockHeight: number }
  | { type: "FAIL"; error: string }
  | { type: "EXPIRE"; error: string }
  | { type: "RESET" };

const TRANSITIONS: Record<
  SwapState["step"],
  Partial<Record<SwapAction["type"], SwapState["step"]>>
> = {
  preview_ready: {
    START_REFRESH: "refreshing_quote",
    RESET: "preview_ready",
  },
  refreshing_quote: {
    START_BUILD: "building_transaction",
    FAIL: "failed",
  },
  building_transaction: {
    START_SIGN: "awaiting_signature",
    FAIL: "failed",
  },
  awaiting_signature: { START_SIGN: "signing", FAIL: "failed" },
  signing: { START_SUBMIT: "submitting", FAIL: "failed" },
  submitting: {
    TX_SUBMITTED: "submitted",
    TX_TRACKING: "tracking",
    FAIL: "failed",
  },
  submitted: { RESET: "preview_ready" },
  tracking: {
    TX_CONFIRMED: "confirmed",
    FAIL: "failed",
    EXPIRE: "expired",
  },
  confirmed: { RESET: "preview_ready" },
  failed: { RESET: "preview_ready" },
  expired: { RESET: "preview_ready" },
};

export function swapReducer(state: SwapState, action: SwapAction): SwapState {
  const allowed = TRANSITIONS[state.step];
  const nextStep = allowed?.[action.type];
  if (!nextStep) return state;

  switch (action.type) {
    case "START_REFRESH":
    case "START_BUILD":
    case "START_SIGN":
    case "START_SUBMIT":
    case "RESET":
      return { step: nextStep } as SwapState;

    case "TX_SUBMITTED":
      return {
        step: nextStep,
        txHash: action.txHash,
        submittedAt: new Date().toISOString(),
      } as SwapState;

    case "TX_TRACKING":
      return {
        step: nextStep,
        txHash: action.txHash,
        submittedAt: new Date().toISOString(),
      } as SwapState;

    case "TX_CONFIRMED":
      return {
        step: nextStep,
        txHash: action.txHash,
        blockHeight: action.blockHeight,
      } as SwapState;

    case "FAIL":
      return { step: nextStep, error: action.error } as SwapState;

    case "EXPIRE":
      return { step: nextStep, error: action.error } as SwapState;
  }
}
