import { chromium } from "playwright";
import { spawn } from "child_process";
import { waitUntilUsed } from "./helpers";

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function main() {
  // Start vite preview
  const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT)], {
    stdio: "pipe",
    shell: true,
  });

  server.stderr?.on("data", (d: Buffer) => process.stderr.write(d));

  let failures = 0;
  let browser;

  try {
    await waitUntilUsed(PORT, 15_000);
    console.log(`\nPreview server ready at ${BASE_URL}\n`);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 15_000 });
    console.log(`Loaded ${BASE_URL}\n`);

    async function check(description: string, fn: () => Promise<void>) {
      try {
        await fn();
        console.log(`  ✓ ${description}`);
      } catch (err) {
        console.error(`  ✗ ${description}: ${err instanceof Error ? err.message : err}`);
        failures++;
      }
    }

    // 1. Page loads and renders the shell
    await check("renders the app shell", async () => {
      const main = await page.waitForSelector("main.shell", { timeout: 5_000 });
      if (!main) throw new Error("main.shell not found");
    });

    // 2. Mock banner is visible
    await check("mock banner visible", async () => {
      const text = await page.textContent('[aria-label="Mock quote simulation"]');
      if (!text?.includes("Mock quote simulation")) throw new Error(`Got: ${text}`);
    });

    // 3. Swap quote panel renders
    await check("swap quote panel visible", async () => {
      const panel = await page.waitForSelector("#quote", { timeout: 3_000 });
      const title = await panel?.textContent();
      if (!title?.includes("Swap quote")) throw new Error(`Got: ${title}`);
    });

    // 4. Amount input is present and has a default value
    await check("amount input present", async () => {
      const input = page.locator('input[aria-label="Amount"]');
      const value = await input.inputValue();
      if (!value || Number(value) <= 0) throw new Error(`Amount is ${value}`);
    });

    // 5. Token buttons render
    await check("token pair buttons render", async () => {
      const buttons = page.locator("button.tokenButton");
      const count = await buttons.count();
      if (count < 2) throw new Error(`Found ${count} token buttons`);
    });

    // 6. Slippage buttons render (first .segments container only)
    await check("slippage segments render", async () => {
      const segments = page.locator(".segments").first().locator("button");
      const count = await segments.count();
      if (count !== 3) throw new Error(`Expected 3 slippage buttons, got ${count}`);
    });

    // 7. Improvement buffer slider exists
    await check("improvement buffer slider exists", async () => {
      const slider = page.locator('input[aria-label="Improvement buffer"]');
      const exists = (await slider.count()) > 0;
      if (!exists) throw new Error("Slider not found");
    });

    // 8. Route comparison panel renders
    await check("route panel renders", async () => {
      const panel = await page.waitForSelector("#routes", { timeout: 3_000 });
      const text = await panel?.textContent();
      if (!text?.includes("Route comparison")) throw new Error(`Got: ${text}`);
    });

    // 9. Route rows render (wait for mock adapter results to load)
    await check("route rows present", async () => {
      await page.waitForSelector(".row.routeRow", { timeout: 8_000 });
      const rows = page.locator(".row.routeRow");
      const count = await rows.count();
      if (count === 0) throw new Error("No route rows found");
      console.log(`      (${count} route rows)`);
    });

    // 10. Exec badge is rendered on routes
    await check("exec badge present on routes", async () => {
      await page.waitForSelector(".execBadge", { timeout: 8_000 });
      const badges = page.locator(".execBadge");
      const count = await badges.count();
      if (count === 0) throw new Error("No exec badges found");
    });

    // 11. Decision proof panel renders
    await check("decision proof panel renders", async () => {
      const panel = await page.waitForSelector("#proof", { timeout: 3_000 });
      const text = await panel?.textContent();
      if (!text?.includes("Decision proof")) throw new Error(`Got: ${text}`);
    });

    // 12. Expected net output displayed
    await check("expected net displayed", async () => {
      const hero = page.locator(".metricHero");
      const text = await hero.textContent();
      if (!text?.includes("Expected net")) throw new Error(`Got: ${text}`);
    });

    // 13. Swap confirmation section renders
    await check("swap confirmation section renders", async () => {
      const confirm = page.locator('[aria-label="Swap confirmation"]');
      const text = await confirm.textContent();
      if (!text?.includes("Swap confirmation")) throw new Error(`Got: ${text}`);
    });

    // 14. Wallet context section renders
    await check("wallet context section renders", async () => {
      const wallet = page.locator('[aria-label="Wallet context"]');
      const text = await wallet.textContent();
      if (!text?.includes("Wallet context")) throw new Error(`Got: ${text}`);
    });

    // 15. Live quote status is present
    await check("live quote status displayed", async () => {
      const status = page.locator(".liveStatus");
      const count = await status.count();
      if (count === 0) throw new Error("Live status not found");
    });

    // 16. Nav links work
    await check("nav links present", async () => {
      const links = page.locator("nav a");
      const texts = await links.allTextContents();
      const expected = ["Swap", "Routes", "Proof"];
      for (const expectText of expected) {
        if (!texts.some((t) => t.trim() === expectText)) {
          throw new Error(`Missing nav link: ${expectText}, found: ${texts}`);
        }
      }
    });

    // 17. Review confirmation button is disabled (no wallet)
    await check("confirm button disabled without wallet", async () => {
      const button = page.locator("button.primaryAction").last();
      const disabled = await button.isDisabled();
      if (!disabled) throw new Error("Confirm button should be disabled without wallet");
    });

    // 18. Topbar brand visible
    await check("topbar brand visible", async () => {
      const brand = page.locator(".brand");
      const text = await brand.textContent();
      if (!text?.includes("ClearRoute")) throw new Error(`Brand missing: ${text}`);
    });

    // 19. Wallet button in topbar exists
    await check("wallet button present in topbar", async () => {
      const walletButton = page.locator("button.walletButton");
      const count = await walletButton.count();
      if (count === 0) throw new Error("Wallet button not found");
    });

    // 20. Status strip renders
    await check("status strip renders", async () => {
      const strip = page.locator(".statusStrip");
      const count = await strip.count();
      if (count === 0) throw new Error("Status strip not found");
    });

    // --- Network selector tests ---

    // 21. Network selector renders with 3 buttons, default active is mainnet
    await check("network selector renders 3 buttons", async () => {
      const networks = page.locator(".segments").nth(1).locator("button");
      const count = await networks.count();
      if (count !== 3) throw new Error(`Expected 3 network buttons, got ${count}`);
      const labels = await networks.allTextContents();
      const expected = ["mainnet", "preprod", "preview"];
      for (const label of expected) {
        if (!labels.includes(label)) throw new Error(`Missing network button: ${label}`);
      }
      const mainnetClass = await networks.nth(0).getAttribute("class");
      if (!mainnetClass?.includes("active")) throw new Error("Default mainnet button should have active class");
    });

    // 22. Switching to preprod changes the effective network display
    await check("switch to preprod network", async () => {
      await page.locator(".segments").nth(1).locator("button", { hasText: "preprod" }).click();
      await page.waitForFunction(
        () => document.querySelector(".panelTitle span")?.textContent?.includes("preprod"),
        { timeout: 5_000 },
      );
    });

    // 23. Switching to preview changes the effective network display
    await check("switch to preview network", async () => {
      await page.locator(".segments").nth(1).locator("button", { hasText: "preview" }).click();
      await page.waitForFunction(
        () => document.querySelector(".panelTitle span")?.textContent?.includes("preview"),
        { timeout: 5_000 },
      );
    });

    // 24. Switching back to mainnet works
    await check("switch back to mainnet", async () => {
      await page.locator(".segments").nth(1).locator("button", { hasText: "mainnet" }).click();
      await page.waitForFunction(
        () => document.querySelector(".panelTitle span")?.textContent?.includes("mainnet"),
        { timeout: 5_000 },
      );
    });

    await page.close();
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }

  if (failures > 0) {
    console.error(`\n${failures} smoke test(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll 24 smoke tests passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
