import { snapshot } from "@/lib/data/repository";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const db = await snapshot();

  const rows = db.users.map((user) => ({
    user,
    jobsCount: db.serviceJobs.filter((job) => job.technicianId === user.id).length,
  }));

  return (
    <UsersClient
      rows={rows}
    />
  );
}
