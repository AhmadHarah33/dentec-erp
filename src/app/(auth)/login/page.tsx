import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth/server";
import { LoginClient } from "./login-client";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already in: the login page has nothing to offer.
  // A stale cookie plus an unreachable database must not take the sign-in page down with it.
  const member = await currentMember().catch(() => null);
  if (member) redirect("/");
  const { next } = await searchParams;
  return <LoginClient next={next ?? "/"} />;
}
