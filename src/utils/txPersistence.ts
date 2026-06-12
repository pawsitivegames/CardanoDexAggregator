const TX_STORAGE_PREFIX = "clearroute:tx:";
const TX_TTL_MS = 60 * 60 * 1000;

type PersistedTx = {
  txHash: string;
  submittedAt: number;
  inputSymbol: string;
  outputSymbol: string;
  amountIn: number;
  networkName: string;
};

export function useTxPersistence() {
  function persistTx(
    txHash: string,
    metadata: Omit<PersistedTx, "txHash" | "submittedAt">,
  ) {
    const entry: PersistedTx = {
      txHash,
      submittedAt: Date.now(),
      ...metadata,
    };
    localStorage.setItem(
      `${TX_STORAGE_PREFIX}${txHash}`,
      JSON.stringify(entry),
    );
  }

  function getPendingTransactions(): PersistedTx[] {
    const entries: PersistedTx[] = [];
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(TX_STORAGE_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const entry: PersistedTx = JSON.parse(raw);
        if (now - entry.submittedAt < TX_TTL_MS) {
          entries.push(entry);
        } else {
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key ?? "");
      }
    }
    return entries.sort((a, b) => b.submittedAt - a.submittedAt);
  }

  function clearTx(txHash: string) {
    localStorage.removeItem(`${TX_STORAGE_PREFIX}${txHash}`);
  }

  return { persistTx, getPendingTransactions, clearTx };
}
