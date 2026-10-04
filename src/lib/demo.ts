/**
 * Demo mode, for a showcase copy of the app (for example on Vercel) running on
 * a throwaway database full of fictional data. Switched on by building with
 * NEXT_PUBLIC_DEMO=1; NEXT_PUBLIC_ means the value is inlined into the client
 * bundle too, so server and browser agree.
 *
 * What it changes, and nothing else:
 *   - There is no database. The demo business ships with the app and lives in
 *     memory (src/lib/data/demo-store.ts).
 *   - There is no sign-in. The visitor picks a role from the banner.
 *   - PDF download is hidden and its routes refuse. PDFs are made by a
 *     headless Chromium that a serverless host does not have.
 *   - A banner says the data is fictional.
 * It adds no permissions and removes none. The real server never sets it.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

/**
 * In demo mode there are no accounts and no sign-in. The visitor browses as one
 * of these roles, chosen from the banner and remembered in a cookie. The
 * permission table applies exactly as it does for a real person with that role,
 * so switching shows what each of them would and would not see.
 */
export const DEMO_ROLE_COOKIE = "dentec_demo_role";
export const DEMO_ROLES = ["owner", "accountant", "sales", "technician", "viewer"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];
