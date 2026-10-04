

/**
 * HTML → PDF, through a real browser.
 *
 * Why a browser and not a PDF drawing library: this document is Arabic first.
 * Arabic needs contextual glyph shaping (a letter's form depends on its
 * neighbours) and bidi reordering (Latin SKUs and Latin digits embedded in an
 * RTL run). Chromium already does both correctly, together with the Cairo
 * webfont the rest of the app is set in. A JS PDF library would need that
 * whole pipeline reimplemented, and the failure mode is exactly the broken
 * disconnected glyphs this is meant to avoid.
 *
 * The browser is launched once and kept: startup is roughly a second, and a
 * user pressing "download" on three invoices should pay it once.
 */

import type { Browser } from "playwright-core";

/**
 * Kept on `globalThis` for the same reason the data store is: Next bundles
 * route handlers separately, and a module-level `let` would give each bundle
 * its own browser — one leaked process per bundle, none of them reused.
 */
declare global {
  var __dentecBrowser: Promise<Browser> | undefined;
}

/**
 * Every render opens a Chromium context (tens of MB) and may hold it for up to
 * 30 s. Unbounded, anyone who may download an invoice can exhaust the
 * container's memory by asking for PDFs in a loop. At most MAX_RENDERS run at
 * once, MAX_WAITING queue behind them, and the rest are turned away.
 */
const MAX_RENDERS = 2;
const MAX_WAITING = 6;
let rendering = 0;
const waiting: (() => void)[] = [];

/** Too many PDFs in flight; the route answers 503 and the person tries again. */
export class RenderBusy extends Error {
  constructor() {
    super("pdf renderer is busy");
  }
}

async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (rendering >= MAX_RENDERS) {
    if (waiting.length >= MAX_WAITING) throw new RenderBusy();
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    rendering++;
  }
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else rendering--;
  }
}

/**
 * Where the headless browser fetches the print page from: this same server,
 * over its own address, never the public one. The session cookie is handed to
 * whatever this returns, so it must never be derived from a request header —
 * a forged Host would send the cookie to a stranger's server. In production
 * that means INTERNAL_ORIGIN, or else the container's own loopback.
 */
export function internalOrigin(requestOrigin: string): string {
  const configured = process.env.INTERNAL_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  return requestOrigin.replace(/\/$/, "");
}

async function getBrowser(): Promise<Browser> {
  if (!globalThis.__dentecBrowser) {
    const launching = import("playwright-core").then(async ({ chromium }) => {
      const browser = await chromium.launch({
        // `playwright` (the wrapper package) registers the downloaded browser
        // path; `playwright-core` is what we import so the bundle stays small.
        executablePath: process.env.CHROMIUM_PATH || undefined,
        // --no-sandbox because the container does not grant Chromium the
        // namespaces its sandbox needs; the page it renders is our own
        // server-rendered print route, JavaScript off and every request
        // outside our origin refused (see renderPdf).
        // --disable-dev-shm-usage: Docker gives /dev/shm 64 MB, and Chromium
        // crashes the tab when a long document fills it.
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
      });
      // A crashed or killed Chromium must not stay cached: the dead handle
      // would fail every later PDF until the container restarted.
      browser.on("disconnected", () => {
        if (globalThis.__dentecBrowser === launching) globalThis.__dentecBrowser = undefined;
      });
      return browser;
    });
    globalThis.__dentecBrowser = launching;
    // A failed launch must not be cached either.
    launching.catch(() => {
      if (globalThis.__dentecBrowser === launching) globalThis.__dentecBrowser = undefined;
    });
  }
  return globalThis.__dentecBrowser;
}

export interface PdfOptions {
  /** Absolute URL of the print route to photograph. */
  url: string;
  /** Cookies to forward, so the page renders in the user's locale. */
  cookies?: { name: string; value: string }[];
  /** Origin the cookies belong to. */
  origin: string;
  landscape?: boolean;
}

export function renderPdf(options: PdfOptions): Promise<Buffer> {
  return withRenderSlot(() => render(options));
}

async function render(options: PdfOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    // The document is laid out in mm at 96dpi; this is A4 at that scale.
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 2,
    // The print route is plain server-rendered HTML and CSS. Nothing in it
    // needs a script, and text that came from a customer's name must never
    // be able to run one in a browser holding the session cookie.
    javaScriptEnabled: false,
  });

  try {
    // Only our own origin (and inline data: URLs) may be fetched. A document
    // that somehow referenced another host would otherwise turn this into a
    // way to make the server request internal addresses.
    const allowed = new URL(options.origin).origin;
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url.startsWith(allowed + "/")) return route.continue();
      return route.abort();
    });

    if (options.cookies?.length) {
      const url = new URL(options.origin);
      await context.addCookies(
        options.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: url.hostname,
          path: "/",
        })),
      );
    }

    const page = await context.newPage();
    const response = await page.goto(options.url, {
      // `networkidle` rather than `load`: the Cairo webfont arrives after
      // load, and photographing before it lands gives a fallback-font PDF.
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    if (!response || !response.ok()) {
      throw new Error(
        `Print route returned ${response?.status() ?? "no response"}`,
      );
    }

    // Belt and braces: fonts.ready resolves once every face used on the page
    // is actually usable, which networkidle alone does not guarantee.
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      // The sheet carries its own padding; a second margin would double it.
      margin: { top: "10mm", bottom: "12mm", left: "0mm", right: "0mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `
        <div style="width:100%;font-size:8px;color:#888;padding:0 14mm;
                    font-family:Cairo,system-ui,sans-serif;
                    display:flex;justify-content:flex-end;">
          <span class="pageNumber"></span>/<span class="totalPages"></span>
        </div>`,
      landscape: options.landscape ?? false,
    });

    return pdf;
  } finally {
    await context.close();
  }
}

/** Content-Disposition value that survives a non-ASCII document number. */
export function attachmentHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
