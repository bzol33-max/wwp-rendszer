"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MODULES, type ModuleKey, type Permissions } from "@/lib/auth/permissions";
import {
  createUser,
  deleteUser,
  resetUserPassword,
  updateUserBasic,
  updateUserPermissions,
  type UserRow,
} from "@/lib/auth/users-actions";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/auth/roles";

type EmployeeOption = { id: string; name: string };

const NINCS_DOLGOZO = "-";

/**
 * A fiók melyik dolgozóhoz tartozik. Ebből tudja a mobil nézet (/erkezes),
 * kinek a jelenlétét, előlegét és szabadságát írja — enélkül a dolgozói
 * fiókok semmilyen saját adatot nem látnak.
 */
function DolgozoValaszto({
  value,
  employees,
  onChange,
}: {
  value: string | null;
  employees: EmployeeOption[];
  onChange: (next: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Dolgozó (mobil nézethez: kinek az adatait látja)</Label>
      <Select
        value={value ?? NINCS_DOLGOZO}
        onValueChange={(v) => onChange(v === NINCS_DOLGOZO ? null : v)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NINCS_DOLGOZO}>— nincs hozzárendelve —</SelectItem>
          {employees.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RoleValaszto({
  value,
  onChange,
  disabled,
}: {
  value: Role;
  onChange: (next: Role) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Szerepkör</Label>
      <Select value={value} onValueChange={(v) => onChange(v as Role)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}



function emptyPermissions(): Permissions {
  const p: Permissions = {};
  for (const m of MODULES) p[m.key] = { view: true, edit: true };
  return p;
}

function csakEzek(kulcsok: ModuleKey[]): Permissions {
  const p: Permissions = {};
  for (const m of MODULES) {
    const be = kulcsok.includes(m.key);
    p[m.key] = { view: be, edit: be };
  }
  return p;
}

/**
 * Szerepkör-választáskor felkínált kiinduló jogosultság ÚJ fióknál. A mobil
 * fiókoknak alig pár modul kell, végigpipálni mind a tizenkilencet pedig
 * hosszú és könnyű elvéteni — a meglévő fiókok (Vadon Gábor, Bodogán Gabi,
 * a két sofőr) pontosan ezekkel a jogokkal futnak. Szerkesztésnél NEM
 * nyúlunk hozzá, ott a meglévő beállítás marad.
 */
function szerepkorAlap(role: Role): Permissions {
  if (role === "admin") return emptyPermissions();
  if (role === "dolgozo") return csakEzek(["erkezes", "elolegek_sajat", "keszlet_sajat"]);
  if (role === "sofor") return csakEzek(["erkezes", "elolegek_sajat", "fuvarozas_sajat"]);
  return emptyPermissions();
}

function PermissionGrid({
  permissions,
  onChange,
  disabled,
}: {
  permissions: Permissions;
  onChange: (next: Permissions) => void;
  disabled?: boolean;
}) {
  function mind(view: boolean) {
    const next: Permissions = {};
    for (const m of MODULES) next[m.key] = { view, edit: view };
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Jogosultságok</span>
        <div className="flex gap-1.5">
          <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => mind(true)}>
            Összes be
          </Button>
          <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => mind(false)}>
            Összes ki
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="text-muted-foreground">Modul</span>
        <span className="text-muted-foreground">Látja</span>
        <span className="text-muted-foreground">Szerkesztheti</span>
        {MODULES.map((mod) => {
          const p = permissions[mod.key] ?? { view: true, edit: true };
          return (
            <div key={mod.key} className="contents">
              <span className="py-1">{mod.label}</span>
              <Checkbox
                disabled={disabled}
                checked={p.view}
                onCheckedChange={(v) => {
                  const view = v === true;
                  onChange({
                    ...permissions,
                    [mod.key]: { view, edit: view && p.edit },
                  });
                }}
              />
              <Checkbox
                disabled={disabled || !p.view}
                checked={p.edit}
                onCheckedChange={(v) =>
                  onChange({
                    ...permissions,
                    [mod.key]: { view: p.view, edit: v === true },
                  })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewUserDialog({
  employees,
  onCreated,
}: {
  employees: EmployeeOption[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("felhasznalo");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Permissions>(emptyPermissions());
  const [pending, startTransition] = useTransition();

  function reset() {
    setUsername("");
    setPassword("");
    setName("");
    setRole("felhasznalo");
    setEmployeeId(null);
    setPermissions(emptyPermissions());
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        await createUser({ username, password, name, role, permissions, employeeId });
        toast.success("Felhasználó létrehozva.");
        reset();
        setOpen(false);
        onCreated();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült létrehozni.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Button onClick={() => setOpen(true)}>Új felhasználó</Button>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-md max-h-[88dvh]">
        <DialogHeader>
          <DialogTitle>Új felhasználó</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-username">Felhasználónév</Label>
            <Input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-name">Név (ez jelenik meg a rögzített tételeken)</Label>
            <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">Jelszó</Label>
            <Input
              id="new-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <RoleValaszto
            value={role}
            onChange={(r) => {
              setRole(r);
              setPermissions(szerepkorAlap(r));
            }}
          />
          <DolgozoValaszto value={employeeId} employees={employees} onChange={setEmployeeId} />
          {role !== "admin" && (
            <PermissionGrid permissions={permissions} onChange={setPermissions} />
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <DialogClose render={<Button variant="outline">Mégse</Button>} />
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Mentés…" : "Létrehozás"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  employees,
  onClose,
  onSaved,
  currentUserId,
}: {
  user: UserRow;
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
  currentUserId: string;
}) {
  const [name, setName] = useState(user.name);
  // A meglévő szerepkört megtartjuk — korábban minden nem-admin fiók
  // "felhasznalo"-ra esett vissza, és a mentés csendben átírta a sofőröket.
  const [role, setRole] = useState<Role>(
    (ROLES.find((r) => r.value === user.role)?.value ?? "felhasznalo") as Role
  );
  const [employeeId, setEmployeeId] = useState<string | null>(user.employee_id);
  const [active, setActive] = useState(user.active);
  const [permissions, setPermissions] = useState<Permissions>({
    ...emptyPermissions(),
    ...user.permissions,
  });
  const [newPassword, setNewPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const isSelf = user.id === currentUserId;

  function handleSaveBasic() {
    startTransition(async () => {
      try {
        await updateUserBasic({ id: user.id, name, role, active, employeeId });
        if (role !== "admin") {
          await updateUserPermissions({ id: user.id, permissions });
        }
        toast.success("Mentve.");
        onSaved();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  function handleResetPassword() {
    if (!newPassword) return;
    startTransition(async () => {
      try {
        await resetUserPassword({ id: user.id, password: newPassword });
        toast.success("Jelszó módosítva.");
        setNewPassword("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült módosítani.");
      }
    });
  }

  function handleDelete() {
    if (isSelf) return;
    startTransition(async () => {
      try {
        await deleteUser({ id: user.id });
        toast.success("Felhasználó törölve.");
        onSaved();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült törölni.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-md max-h-[88dvh]">
        <DialogHeader>
          <DialogTitle>{user.username}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <Label>Név</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <RoleValaszto value={role} onChange={setRole} disabled={isSelf} />
          <DolgozoValaszto value={employeeId} employees={employees} onChange={setEmployeeId} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={active}
              disabled={isSelf}
              onCheckedChange={(v) => setActive(v === true)}
            />
            Aktív (kikapcsolva nem tud bejelentkezni)
          </label>
          {role !== "admin" && (
            <PermissionGrid permissions={permissions} onChange={setPermissions} />
          )}
          <div className="flex flex-col gap-1.5 border-t pt-3">
            <Label>Új jelszó megadása (opcionális)</Label>
            <div className="flex gap-2">
              <Input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Új jelszó"
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending || !newPassword}
                onClick={handleResetPassword}
              >
                Csere
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="text-destructive"
            disabled={pending || isSelf}
            onClick={handleDelete}
          >
            Törlés
          </Button>
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline">Bezár</Button>} />
            <Button onClick={handleSaveBasic} disabled={pending}>
              {pending ? "Mentés…" : "Mentés"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersManager({
  initialUsers,
  employees,
  currentUserId,
}: {
  initialUsers: UserRow[];
  employees: EmployeeOption[];
  currentUserId: string;
}) {
  const [users] = useState(initialUsers);
  const [editing, setEditing] = useState<UserRow | null>(null);

  function refresh() {
    // A szerver akciók revalidatePath-ot hívnak; a legegyszerűbb és
    // legmegbízhatóbb módja annak, hogy a kliens tábla is friss adatot
    // mutasson, egy teljes újratöltés (ez a felület ritkán, admin által
    // használt oldal, nem kritikus a villanásmentes frissítés).
    window.location.reload();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Felhasználók ({users.length})</CardTitle>
        <NewUserDialog employees={employees} onCreated={refresh} />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Felhasználónév</TableHead>
              <TableHead>Név</TableHead>
              <TableHead>Szerepkör</TableHead>
              <TableHead>Dolgozó</TableHead>
              <TableHead>Állapot</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell>
                  {u.role === "admin" ? (
                    <Badge>Admin</Badge>
                  ) : (
                    <Badge variant="secondary">{ROLE_LABEL[u.role] ?? u.role}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {u.employee_name ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {u.active ? (
                    <span className="text-xs text-muted-foreground">Aktív</span>
                  ) : (
                    <Badge variant="destructive">Kikapcsolva</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                    Szerkesztés
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {editing && (
        <EditUserDialog
          user={editing}
          employees={employees}
          currentUserId={currentUserId}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </Card>
  );
}
