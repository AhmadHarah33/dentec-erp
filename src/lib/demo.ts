/**
 * Demo mode, for a showcase copy of the app (for example on Vercel) running on
 * a throwaway database full of fictional data. Switched on by building with
 * NEXT_PUBLIC_DEMO=1; NEXT_PUBLIC_ means the value is inlined into the client
 * bundle too, so server and browser agree.
 *
 * What it changes, and nothing else:
 *   - PDF download is hidden and its routes refuse. PDFs are made by a
 *     headless Chromium that a serverless host does not have.
 *   - A banner says the data is fictional.
 * It adds no permissions and removes none. The real server never sets it.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
