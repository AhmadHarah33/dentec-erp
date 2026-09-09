

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

async function getBrowser(): Promise<Browser> {
  if (!globalThis.__dentecBrowser) {
    globalThis.__dentecBrowser = import("playwright-core").then(({ chromium }) =>
      chromium.launch({
        // `playwright` (the wrapper package) registers the downloaded browser
        // path; `playwright-core` is what we import so the bundle stays small.
        executablePath: process.env.CHROMIUM_PATH || undefined,
        args: ["--no-sandbox", "--font-render-hinting=none"],
      }),
    );
    // A failed launch must not be cached, or every later request inherits it.
    globalThis.__dentecBrowser.catch(() => {
      globalThis.__dentecBrowser = undefined;
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

export async function renderPdf(options: PdfOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    // The document is laid out in mm at 96dpi; this is A4 at that scale.
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 2,
  });

  try {
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
