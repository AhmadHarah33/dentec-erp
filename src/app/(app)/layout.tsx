import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { snapshot } from "@/lib/data/repository";
import { getLocale } from "@/lib/i18n/server";
import { buildSearchIndex } from "@/lib/search";
import { canVisit } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import { RoleProvider } from "@/components/app/role-context";
import { Tour } from "@/components/app/tour";
import { PasswordModal } from "@/components/app/account-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Signed in to Supabase but without an active profile (deactivated, or an
  // account made outside the app): end that session rather than loop between
  // here and /login, which the middleware would bounce straight back.
  if (!user) redirect("/auth/signout?reason=inactive");

  // The search index is plain data, built once here and handed to the client
  // top bar. A function cannot cross this boundary, so the filtering lives in
  // the client component and only the rows travel. A role only finds what it
  // can open.
  const locale = await getLocale();
  const db = await snapshot();
  const search = buildSearchIndex(db, locale).filter((entry) => canVisit(user.role, entry.href));

  return (
    <RoleProvider
      session={{
        role: user.role,
        demo: user.demo,
        name: user.name,
        email: user.email,
        tourPending: user.tourPending,
      }}
    >
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar search={search} />
          {/* overflow-x-clip is a guard, not a workaround for sloppy layout:
              one page that overflows would otherwise widen the layout viewport
              for the whole app on a phone, shifting every screen sideways.
              `clip` rather than `hidden` so this never becomes a scroll
              container — sticky children and fixed dialogs keep working. */}
          <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8 max-w-[1440px] w-full overflow-x-clip">
            {children}
          </main>
        </div>
      </div>
      {/* An invited account signs in with a password its owner has seen. */}
      {user.mustChangePassword && <PasswordModal open forced />}
      <Tour autoStart={user.tourPending && !user.mustChangePassword} />
    </RoleProvider>
  );
}
