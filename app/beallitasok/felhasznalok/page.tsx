import { PageHeader } from "@/components/layout/page-header";
import { requireAdmin } from "@/lib/auth/dal";
import { listEmployeeOptions, listUsers } from "@/lib/auth/users-actions";
import { UsersManager } from "@/components/beallitasok/users-manager";

export default async function Page() {
  const session = await requireAdmin();
  const users = await listUsers();
  // A dolgozó-választóhoz: a mobil nézetek a users.employee_id-ból tudják,
  // kinek a jelenlétét/előlegét/szabadságát írják.
  const employees = await listEmployeeOptions();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Felhasználók"
        subtitle="Felhasználók kezelése és modulonkénti megtekintési/szerkesztési jogosultságok beállítása."
      />
      <UsersManager
        initialUsers={users}
        employees={employees}
        currentUserId={session.userId}
      />
    </div>
  );
}
