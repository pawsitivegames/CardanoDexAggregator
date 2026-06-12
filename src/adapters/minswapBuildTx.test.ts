import { describe, expect, it } from "vitest";
import { buildTxRequestFromQuote, buildUnsignedTx, submitSignedTx } from "./minswapBuildTx";
import { LOVELACE_ASSET_ID } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";

const baseRequest: QuoteRequest = {
  inputAssetId: LOVELACE_ASSET_ID,
  outputAssetId: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
  amountIn: 100,
  slippageTolerancePct: 0.5,
  network: "preprod",
};

describe("buildTxRequestFromQuote", () => {
  it("maps a QuoteRequest + sender to a BuildTxRequest", () => {
    const result = buildTxRequestFromQuote(baseRequest, "addr_test1...");
    expect(result.sender).toBe("addr_test1...");
    expect(result.amount).toBe("100");
    expect(result.token_in).toBe(LOVELACE_ASSET_ID);
    expect(result.token_out).toBe("29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e");
    expect(result.slippage).toBe(0.5);
    expect(result.include_protocols).toEqual(["MinswapV2"]);
    expect(result.allow_multi_hops).toBe(false);
    expect(result.amount_in_decimal).toBe(true);
  });
});

describe("buildUnsignedTx", () => {
  it("returns error when given a bogus base URL", async () => {
    const result = await buildUnsignedTx(
      {
        sender: "addr_test1...",
        amount: "100",
        token_in: LOVELACE_ASSET_ID,
        token_out: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
        slippage: 0.5,
        include_protocols: ["MinswapV2"],
        allow_multi_hops: false,
        amount_in_decimal: true,
      },
      "https://nonexistent.example.com",
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected failure");
    expect(result.error).toBeTruthy();
  });
});

describe("submitSignedTx", () => {
  it("returns error when given a bogus base URL", async () => {
    const result = await submitSignedTx(
      { cbor: "invalid", witness_set: "invalid" },
      "https://nonexistent.example.com",
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected failure");
    expect(result.error).toBeTruthy();
  });
});
