import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth/server";
import { LoginClient } from "./login-client";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already in: the login page has nothing to offer.
  if (await currentMember()) redirect("/");
  const { next } = await searchParams;
  return <LoginClient next={next ?? "/"} />;
}
