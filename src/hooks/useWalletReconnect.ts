import { useState, useEffect } from "react";
import type { Cip30WalletApi, Cip30WalletProvider, WalletInfo } from "../wallet/cip30";

const WALLET_KEY_STORAGE = "clearroute:wallet:lastConnected";

export function useWalletReconnect(
  cardano: unknown,
  onConnected: (api: Cip30WalletApi, wallet: WalletInfo, provider: Cip30WalletProvider) => void,
) {
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const lastWalletKey = localStorage.getItem(WALLET_KEY_STORAGE);
    if (!lastWalletKey || typeof cardano !== "object" || cardano === null)
      return;

    const record = cardano as Record<string, unknown>;
    const provider = record[lastWalletKey];
    if (
      !provider ||
      typeof (provider as Cip30WalletProvider).enable !== "function"
    )
      return;

    setIsReconnecting(true);
    (provider as Cip30WalletProvider)
      .enable()
      .then((api) => {
        const p = provider as Cip30WalletProvider;
        onConnected(api, {
          id: lastWalletKey,
          name: p.name || lastWalletKey,
        }, p);
      })
      .catch(() => {
        localStorage.removeItem(WALLET_KEY_STORAGE);
      })
      .finally(() => setIsReconnecting(false));
  }, []);

  function persistWalletKey(key: string) {
    localStorage.setItem(WALLET_KEY_STORAGE, key);
  }

  function clearWalletKey() {
    localStorage.removeItem(WALLET_KEY_STORAGE);
  }

  return { isReconnecting, persistWalletKey, clearWalletKey };
}
