export type GroupRole = "owner" | "admin" | "member";

export interface GroupInfoMember {
  readonly userId: string;
  readonly username: string;
  readonly role: GroupRole | string;
}

export function normalizeRole(role: GroupInfoMember["role"]): GroupRole {
  if (role === "owner" || role === "admin") return role;
  return "member";
}

export function roleSortKey(role: GroupRole): number {
  if (role === "owner") return 0;
  if (role === "admin") return 1;
  return 2;
}
