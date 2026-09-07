import { PageHeader } from "@/components/layout/page-header";
import { requireAdmin } from "@/lib/auth/dal";
import { listUsers } from "@/lib/auth/users-actions";
import { UsersManager } from "@/components/beallitasok/users-manager";

export default async function Page() {
  const session = await requireAdmin();
  const users = await listUsers();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Felhasználók"
        subtitle="Felhasználók kezelése és modulonkénti megtekintési/szerkesztési jogosultságok beállítása."
      />
      <UsersManager initialUsers={users} currentUserId={session.userId} />
    </div>
  );
}
