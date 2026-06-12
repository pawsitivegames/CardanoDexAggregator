import {
  MINSWAP_AGGREGATOR_PREPROD_BASE_URL,
  EXECUTABLE_NETWORK,
  LIVE_QUOTE_TIMEOUT_MS,
} from "../config/networks";
import type { QuoteRequest } from "../domain/routes";
import { fetchWithRetry } from "./fetchUtils";

export type BuildTxRequest = {
  sender: string;
  amount: string;
  token_in: string;
  token_out: string;
  slippage: number;
  include_protocols: string[];
  allow_multi_hops: boolean;
  amount_in_decimal: boolean;
};

export type BuildTxResponse = {
  cbor: string;
};

export type SubmitTxRequest = {
  cbor: string;
  witness_set: string;
};

export type SubmitTxResponse = {
  tx_id: string;
};

export type BuildTxError = {
  ok: false;
  error: string;
};

export type BuildTxSuccess = {
  ok: true;
  cbor: string;
};

export type SubmitTxSuccess = {
  ok: true;
  txId: string;
};

export type SubmitTxError = {
  ok: false;
  error: string;
};


export async function buildUnsignedTx(
  request: BuildTxRequest,
  baseUrl = MINSWAP_AGGREGATOR_PREPROD_BASE_URL,
): Promise<BuildTxSuccess | BuildTxError> {
  try {
    const response = await fetchWithRetry(
      `${baseUrl}/build-tx`,
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: request.sender,
          amount: request.amount,
          token_in: request.token_in,
          token_out: request.token_out,
          slippage: request.slippage,
          include_protocols: request.include_protocols,
          allow_multi_hops: request.allow_multi_hops,
          amount_in_decimal: request.amount_in_decimal,
        }),
      },
      LIVE_QUOTE_TIMEOUT_MS,
      2,
    );

    if (!response.ok) {
      return { ok: false, error: `Build-tx failed with HTTP ${response.status}.` };
    }

    const json = (await response.json()) as BuildTxResponse;
    if (!json.cbor || typeof json.cbor !== "string") {
      return { ok: false, error: "Build-tx response missing CBOR field." };
    }

    return { ok: true, cbor: json.cbor };
  } catch {
    return { ok: false, error: "Build-tx request timed out or could not be fetched." };
  }
}

export async function submitSignedTx(
  request: SubmitTxRequest,
  baseUrl = MINSWAP_AGGREGATOR_PREPROD_BASE_URL,
): Promise<SubmitTxSuccess | SubmitTxError> {
  try {
    const response = await fetchWithRetry(
      `${baseUrl}/finalize-and-submit-tx`,
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          cbor: request.cbor,
          witness_set: request.witness_set,
        }),
      },
      LIVE_QUOTE_TIMEOUT_MS,
      2,
    );

    if (!response.ok) {
      return { ok: false, error: `Submit-tx failed with HTTP ${response.status}.` };
    }

    const json = (await response.json()) as SubmitTxResponse;
    if (!json.tx_id || typeof json.tx_id !== "string") {
      return { ok: false, error: "Submit-tx response missing tx_id field." };
    }

    return { ok: true, txId: json.tx_id };
  } catch {
    return { ok: false, error: "Submit-tx request timed out or could not be fetched." };
  }
}

export function buildTxRequestFromQuote(
  request: QuoteRequest,
  sender: string,
): BuildTxRequest {
  return {
    sender,
    amount: String(request.amountIn),
    token_in: request.inputAssetId,
    token_out: request.outputAssetId,
    slippage: request.slippageTolerancePct,
    include_protocols: ["MinswapV2"],
    allow_multi_hops: false,
    amount_in_decimal: true,
  };
}
