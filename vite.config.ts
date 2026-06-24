import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const minswapPoolProxy = {
  target: "https://api-mainnet-prod.minswap.org",
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/api\/minswap-pool/, ""),
};

const steelswapProxy = {
  target: "https://api.steelswap.io",
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/api\/steelswap/, ""),
  configure: (proxy: { on: (event: string, handler: (proxyReq: { setHeader: (name: string, value: string) => void }) => void) => void }) => {
    proxy.on("proxyReq", (proxyReq) => {
      proxyReq.setHeader("origin", "https://steelswap.io");
      proxyReq.setHeader("referer", "https://steelswap.io/");
      proxyReq.setHeader(
        "user-agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      );
      proxyReq.setHeader("sec-fetch-site", "same-site");
      proxyReq.setHeader("sec-fetch-mode", "cors");
      proxyReq.setHeader("sec-fetch-dest", "empty");
    });
  },
};

function simpleProxy(target: string, prefix: RegExp, headers?: Record<string, string>) {
  return {
    target,
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(prefix, ""),
    configure: headers
      ? (proxy: { on: (event: string, handler: (proxyReq: { setHeader: (name: string, value: string) => void }) => void) => void }) => {
          proxy.on("proxyReq", (proxyReq) => {
            for (const [name, value] of Object.entries(headers)) {
              if (value) proxyReq.setHeader(name, value);
            }
          });
        }
      : undefined,
  };
}

function blockfrostProxy(target: string, projectId: string) {
  return {
    target,
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/api\/blockfrost\/[^/]+/, ""),
    configure: (proxy: { on: (event: string, handler: (proxyReq: { setHeader: (name: string, value: string) => void }) => void) => void }) => {
      proxy.on("proxyReq", (proxyReq) => {
        if (projectId) proxyReq.setHeader("project_id", projectId);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = {
    "/api/minswap-pool": minswapPoolProxy,
    "/api/steelswap": steelswapProxy,
    "/api/cardexscan": simpleProxy(
      env.CARDEXSCAN_API_BASE_URL || "https://cardexscan.com/api/cds",
      /^\/api\/cardexscan/,
      env.CARDEXSCAN_API_KEY ? { "x-api-key": env.CARDEXSCAN_API_KEY } : undefined,
    ),
    "/api/saturnswap": simpleProxy(
      "https://api.saturnswap.io",
      /^\/api\/saturnswap/,
      env.SATURN_API_KEY ? { SATURN_API_KEY: env.SATURN_API_KEY } : undefined,
    ),
    "/api/wingriders": simpleProxy(
      "https://api.mainnet.wingriders.com",
      /^\/api\/wingriders/,
    ),
    "/api/blockfrost/mainnet": blockfrostProxy(
      "https://cardano-mainnet.blockfrost.io/api/v0",
      env.BLOCKFROST_MAINNET_PROJECT_ID,
    ),
    "/api/blockfrost/preprod": blockfrostProxy(
      "https://cardano-preprod.blockfrost.io/api/v0",
      env.BLOCKFROST_PREPROD_PROJECT_ID,
    ),
    "/api/blockfrost/preview": blockfrostProxy(
      "https://cardano-preview.blockfrost.io/api/v0",
      env.BLOCKFROST_PREVIEW_PROJECT_ID,
    ),
  };

  return {
    plugins: [react()],
    server: {
      proxy,
    },
    preview: {
      proxy,
    },
  };
});
