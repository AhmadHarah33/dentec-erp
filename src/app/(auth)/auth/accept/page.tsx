import { AcceptClient } from "./accept-client";

/**
 * Where invitation and password-reset links land. The token is NOT verified
 * here — opening the page must not spend it, because mail and chat apps
 * open links to preview them. It is verified when the form is submitted.
 */
export default async function AcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; token?: string }>;
}) {
  const { type, token } = await searchParams;
  return <AcceptClient type={type === "recovery" ? "recovery" : "invite"} token={token ?? ""} />;
}
