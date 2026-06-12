import React from "react";

export type NetworkStatus = "healthy" | "degraded" | "offline" | "error";

interface NetworkStatusBannerProps {
  status: NetworkStatus;
  adapterCount: number;
  healthyCount: number;
  onRetry: () => void;
}

export function NetworkStatusBanner({
  status,
  adapterCount,
  healthyCount,
  onRetry,
}: NetworkStatusBannerProps) {
  if (status === "healthy") return null;

  return (
    <div className={`networkBanner ${status}`} role="alert">
      {status === "degraded" && (
        <span>
          Showing quotes from {healthyCount} of {adapterCount} sources. Some
          liquidity providers are unavailable.
        </span>
      )}
      {status === "offline" && (
        <span>You are offline. Check your internet connection.</span>
      )}
      {status === "error" && (
        <span>All quote sources are currently unavailable. Please try again.</span>
      )}
      <button onClick={onRetry}>Retry</button>
    </div>
  );
}
