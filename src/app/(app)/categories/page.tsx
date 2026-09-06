import { snapshot } from "@/lib/data/repository";
import { getI18n } from "@/lib/i18n/server";
import { CategoriesClient } from "./categories-client";

export default async function CategoriesPage() {
  const { locale } = await getI18n();
  const db = await snapshot();

  // Count items per category once here rather than per row in the client.
  const counts: Record<string, number> = {};
  for (const item of db.items) {
    if (item.categoryId) counts[item.categoryId] = (counts[item.categoryId] ?? 0) + 1;
  }

  return (
    <CategoriesClient
      categories={db.categories}
      counts={counts}
      locale={locale}
    />
  );
}
