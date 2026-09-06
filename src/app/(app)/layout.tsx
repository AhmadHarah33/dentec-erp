import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { snapshot } from "@/lib/data/repository";
import { getLocale } from "@/lib/i18n/server";
import { buildSearchIndex } from "@/lib/search";
import { getViewRole } from "@/lib/roles.server";
import { RoleProvider } from "@/components/app/role-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The search index is plain data, built once here and handed to the client
  // top bar. A function cannot cross this boundary, so the filtering lives in
  // the client component and only the rows travel.
  const locale = await getLocale();
  const role = await getViewRole();
  const db = await snapshot();
  const search = buildSearchIndex(db, locale);

  return (
    <RoleProvider role={role}>
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
    </RoleProvider>
  );
}
