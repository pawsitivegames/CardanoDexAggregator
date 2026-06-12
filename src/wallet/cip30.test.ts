import { describe, expect, it } from "vitest";
import { FIRST_LIVE_PAIR } from "../config/networks";
import { LOVELACE_ASSET_ID } from "../domain/assets";
import { connectWallet, discoverWallets, parseBalanceCbor, requiredInputQuantity, type Cip30WalletProvider } from "./cip30";

const snekAssetId = FIRST_LIVE_PAIR.outputAssetId;
const snekPolicyId = snekAssetId.slice(0, 56);
const snekAssetName = snekAssetId.slice(56);

describe("CIP-30 wallet helpers", () => {
  it("discovers injected wallet providers", () => {
    const wallets = discoverWallets({
      lace: { name: "Lace", icon: "data:image/png;base64,", apiVersion: "1.0.0", enable: async () => ({}) },
      random: { enable: "nope" },
    });

    expect(wallets).toHaveLength(1);
    expect(wallets[0].id).toBe("lace");
    expect(wallets[0].name).toBe("Lace");
  });

  it("parses lovelace-only CBOR balances", () => {
    const balance = parseBalanceCbor("1a3b9aca00");

    expect(balance.assets[LOVELACE_ASSET_ID]).toBe(1_000_000_000n);
  });

  it("parses native asset CBOR balances", () => {
    const balance = parseBalanceCbor(`821a3b9aca00a1581c${snekPolicyId}a144${snekAssetName}1864`);

    expect(balance.assets[LOVELACE_ASSET_ID]).toBe(1_000_000_000n);
    expect(balance.assets[snekAssetId]).toBe(100n);
  });

  it("scales required input by asset decimals", () => {
    expect(requiredInputQuantity({ inputAssetId: LOVELACE_ASSET_ID, amountIn: 1.5 })).toBe(1_500_000n);
    expect(requiredInputQuantity({ inputAssetId: snekAssetId, amountIn: 12 })).toBe(12n);
  });

  it("connects and reports wallet blockers without signing", async () => {
    const wallet: Cip30WalletProvider = {
      id: "lace",
      name: "Lace",
      enable: async () => ({
        getNetworkId: async () => 0,
        getBalance: async () => "1a000f4240",
        getUsedAddresses: async () => ["addr_test1qra9jv6w7k9q2v6k8f3x5g4h3j2k1l0"],
        getUnusedAddresses: async () => [],
        getChangeAddress: async () => "addr_test1qra9jv6w7k9q2v6k8f3x5g4h3j2k1l0",
        getRewardAddresses: async () => [],
        signTx: async () => "a100...",
        submitTx: async () => "abc123",
      }),
    };

    const context = await connectWallet(wallet, { inputAssetId: LOVELACE_ASSET_ID, amountIn: 2 });

    expect(context.status).toBe("connected");
    if (context.status !== "connected") throw new Error("Expected connected wallet.");
    expect(context.blockers).toContain("Insufficient input asset balance for the current amount.");
  });

  it("normalizes rejected wallet connection errors", async () => {
    const wallet: Cip30WalletProvider = {
      id: "nami",
      name: "Nami",
      enable: async () => {
        throw new Error("User rejected connection");
      },
    };

    const context = await connectWallet(wallet, { inputAssetId: LOVELACE_ASSET_ID, amountIn: 1 });

    expect(context.status).toBe("error");
    if (context.status !== "error") throw new Error("Expected wallet error.");
    expect(context.code).toBe("rejected");
  });

  it("blocks mainnet wallets for executable swaps", async () => {
    const wallet: Cip30WalletProvider = {
      id: "nami",
      name: "Nami",
      enable: async () => ({
        getNetworkId: async () => 1,
        getBalance: async () => "1a3b9aca00",
        getUsedAddresses: async () => ["addr1qra9jv6w7k9q2v6k8f3x5g4h3j2k1l0"],
        getUnusedAddresses: async () => [],
        getChangeAddress: async () => "addr1qra9jv6w7k9q2v6k8f3x5g4h3j2k1l0",
        getRewardAddresses: async () => [],
        signTx: async () => "a100...",
        submitTx: async () => "abc123",
      }),
    };

    const context = await connectWallet(wallet, { inputAssetId: LOVELACE_ASSET_ID, amountIn: 1 });

    expect(context.status).toBe("connected");
    if (context.status !== "connected") throw new Error("Expected connected wallet.");
    expect(context.blockers).toContain("Wrong network: connected wallet is mainnet. Switch to testnet (preprod) for executable swaps.");
  });

  it("provides wallet address on connection", async () => {
    const wallet: Cip30WalletProvider = {
      id: "eternl",
      name: "Eternl",
      enable: async () => ({
        getNetworkId: async () => 0,
        getBalance: async () => "1a3b9aca00",
        getUsedAddresses: async () => ["addr_test1qra9jv6w7k9q2v6k8f3x5g4h3j2k1l0"],
        getUnusedAddresses: async () => [],
        getChangeAddress: async () => "addr_test1qra9jv6w7k9q2v6k8f3x5g4h3j2k1l0",
        getRewardAddresses: async () => [],
        signTx: async () => "a100...",
        submitTx: async () => "abc123",
      }),
    };

    const context = await connectWallet(wallet, { inputAssetId: LOVELACE_ASSET_ID, amountIn: 1 });

    expect(context.status).toBe("connected");
    if (context.status !== "connected") throw new Error("Expected connected wallet.");
    expect(context.address).toBe("addr_test1qra9jv6w7k9q2v6k8f3x5g4h3j2k1l0");
  });
});
