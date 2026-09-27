import { redirect } from "next/navigation";
import { isSupabaseEnabled } from "@/lib/supabase/config";
import { setupState } from "@/app/actions/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; inactive?: string }>;
}) {
  // Demo mode has no accounts; there is nothing to sign in to.
  if (!isSupabaseEnabled()) redirect("/");
  // A brand-new database has no owner yet — send the first visitor to setup.
  if ((await setupState()) === "ready") redirect("/setup");

  const { next, inactive } = await searchParams;
  return <LoginForm next={next ?? "/"} inactive={inactive === "1"} />;
}
