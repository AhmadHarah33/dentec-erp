import { LocaleToggle } from "@/components/app/locale-toggle";

/**
 * The signed-out shell: one centred card on the canvas, no sidebar, no
 * search. Everything here is reachable without a session (see PUBLIC in
 * middleware.ts), so nothing here may read business data.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Dentec" className="h-8 w-auto mx-auto mb-8" />
        <div className="rounded-lg border border-line bg-surface shadow-card p-6 sm:p-8">{children}</div>
        <div className="flex justify-center mt-6">
          <LocaleToggle />
        </div>
      </div>
    </main>
  );
}
