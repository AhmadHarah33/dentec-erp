import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { DEMO } from "@/lib/demo";
import { buildSearchIndex } from "@/lib/search";
import { requireMember } from "@/lib/auth/server";
import { MemberProvider } from "@/components/app/member-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The search index is plain data, built once here and handed to the client
  // top bar. A function cannot cross this boundary, so the filtering lives in
  // the client component and only the rows travel.
  // Every page under (app) is members-only. The middleware has already
  // turned away requests with no session; this turns away sessions that do
  // not belong to an active ERP member.
  const member = await requireMember();
  const { locale, t } = await getI18n();
  const db = await snapshot();
  const search = buildSearchIndex(db, locale, member.role);

  return (
    <MemberProvider
      member={{ id: member.user.id, name: member.user.name, email: member.email, role: member.role }}
    >
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          {DEMO && (
            <div className="bg-accent/10 text-accent text-2xs font-medium text-center px-4 py-1.5 hairline-b">
              {t("demo.banner")}
            </div>
          )}
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
    </MemberProvider>
  );
}
