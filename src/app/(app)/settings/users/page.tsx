import { snapshot } from "@/lib/data/repository";
import { requireSection } from "@/lib/session";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const me = await requireSection("settings");
  const db = await snapshot();

  const rows = db.users.map((user) => ({
    user,
    jobsCount: db.serviceJobs.filter((job) => job.technicianId === user.id).length,
  }));

  return <UsersClient rows={rows} currentUserId={me.id} accounts={!me.demo} />;
}
