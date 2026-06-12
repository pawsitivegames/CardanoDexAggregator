import { useState } from "react";

const PREFS_STORAGE = "clearroute:preferences";

export type UserPreferences = {
  inputSymbol?: string;
  outputSymbol?: string;
  slippageTolerance?: number;
  selectedNetwork?: "mainnet" | "preprod" | "preview";
};

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    try {
      return JSON.parse(localStorage.getItem(PREFS_STORAGE) ?? "{}");
    } catch {
      return {};
    }
  });

  function updatePrefs(patch: Partial<UserPreferences>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(PREFS_STORAGE, JSON.stringify(next));
      return next;
    });
  }

  return [prefs, updatePrefs] as const;
}
