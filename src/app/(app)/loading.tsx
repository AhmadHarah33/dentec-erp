import { getI18n } from "@/lib/i18n/server";

/**
 * Shown while a page's data loads. Shaped like the page it stands in for —
 * a title, a row of tiles, a table — so nothing jumps when the real content
 * lands. It pulses rather than spins: a spinner says "wait", a skeleton says
 * "this is what is coming".
 */
export default async function Loading() {
  const { t } = await getI18n();
  const block = "rounded-sm bg-sunken animate-pulse";

  return (
    <div role="status" aria-label={t("state.loading")}>
      <div className="mb-8">
        <div className={`${block} h-7 w-48`} />
        <div className={`${block} h-4 w-72 mt-2.5`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-lg border border-line bg-surface shadow-card p-5 h-[7.5rem]">
            <div className={`${block} h-3.5 w-24`} />
            <div className={`${block} h-7 w-28 mt-6`} />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface shadow-card overflow-hidden">
        <div className="h-12 bg-sunken/60 hairline-b" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-11 px-4 flex items-center gap-6 hairline-b last:border-b-0">
            <div className={`${block} h-3.5 w-28`} />
            <div className={`${block} h-3.5 flex-1 max-w-64`} />
            <div className={`${block} h-3.5 w-20 ms-auto`} />
          </div>
        ))}
      </div>
    </div>
  );
}
