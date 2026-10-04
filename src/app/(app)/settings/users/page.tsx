import { snapshot } from "@/lib/data/repository";
import { accountStates, requireAccess } from "@/lib/auth/server";
import { mailEnabled } from "@/lib/mail";
import { UsersClient, type Access } from "./users-client";

export default async function UsersPage() {
  const member = await requireAccess("settings", "edit");
  const db = await snapshot();
  const states = await accountStates();

  const rows = db.users.map((user) => {
    const state = states.get(user.id);
    // Signed in once = active; a password never used still counts as active
    // (set via a link); only an outstanding invitation is "invited".
    const access: Access = !user.active
      ? "disabled"
      : state?.lastSignIn || state?.hasPassword
        ? "active"
        : state?.pendingInvite
          ? "invited"
          : "none";
    return { user, access, jobsCount: db.serviceJobs.filter((job) => job.technicianId === user.id).length };
  });

  return <UsersClient rows={rows} selfId={member.user.id} mailEnabled={mailEnabled()} />;
}
