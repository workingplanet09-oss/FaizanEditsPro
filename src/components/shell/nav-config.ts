import type { Command } from "./command-palette";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** any of these permissions makes the item visible (staff areas) */
  perm?: string[];
  /** highlight only on exact match (dashboard roots) */
  exact?: boolean;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const CLIENT_NAV: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard", exact: true },
      { label: "Projects", href: "/dashboard/projects", icon: "film" },
      { label: "Files", href: "/dashboard/files", icon: "folder" },
      { label: "Messages", href: "/dashboard/messages", icon: "message" },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Quotes", href: "/dashboard/quotes", icon: "clipboard" },
      { label: "Contracts", href: "/dashboard/contracts", icon: "sign" },
      { label: "Invoices", href: "/dashboard/invoices", icon: "receipt" },
      { label: "Retainers", href: "/dashboard/retainers", icon: "repeat" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Brand kit", href: "/dashboard/brand-kit", icon: "palette" },
      { label: "Settings", href: "/dashboard/settings", icon: "settings" },
      { label: "Help", href: "/help", icon: "help" },
    ],
  },
];

export const ADMIN_NAV: NavGroup[] = [
  {
    items: [
      { label: "Command center", href: "/admin", icon: "dashboard", exact: true },
      { label: "Calendar", href: "/admin/calendar", icon: "calendar-days" },
      { label: "Tasks", href: "/admin/tasks", icon: "checklist", perm: ["tasks:read"] },
    ],
  },
  {
    label: "Work",
    items: [
      { label: "Projects", href: "/admin/projects", icon: "film", perm: ["projects:read_all", "projects:read_assigned"] },
      { label: "Revisions", href: "/admin/revisions", icon: "refresh", perm: ["revisions:manage", "projects:read_all"] },
      { label: "Files", href: "/admin/files", icon: "folder", perm: ["files:read"] },
      { label: "Messages", href: "/admin/messages", icon: "message", perm: ["messages:read"] },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Leads & CRM", href: "/admin/leads", icon: "inbox", perm: ["leads:read"] },
      { label: "Clients", href: "/admin/clients", icon: "building", perm: ["clients:read"] },
      { label: "Quotes", href: "/admin/quotes", icon: "clipboard", perm: ["quotes:read"] },
      { label: "Contracts", href: "/admin/contracts", icon: "sign", perm: ["contracts:read"] },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Invoices", href: "/admin/invoices", icon: "receipt", perm: ["invoices:read"] },
      { label: "Payments", href: "/admin/payments", icon: "wallet", perm: ["payments:read"] },
      { label: "Retainers", href: "/admin/retainers", icon: "repeat", perm: ["retainers:manage", "invoices:read"] },
    ],
  },
  {
    label: "Website",
    items: [
      { label: "Content", href: "/admin/content", icon: "news", perm: ["cms:manage"] },
      { label: "Project form", href: "/admin/forms", icon: "clipboard", perm: ["forms:manage"] },
      { label: "Submissions", href: "/admin/submissions", icon: "mail", perm: ["cms:manage", "leads:read"] },
    ],
  },
  {
    label: "Studio",
    items: [
      { label: "Analytics", href: "/admin/analytics", icon: "chart", perm: ["analytics:read"] },
      { label: "Automations", href: "/admin/automations", icon: "workflow", perm: ["automations:manage"] },
      { label: "Team", href: "/admin/team", icon: "users", perm: ["team:manage"] },
      { label: "Exports", href: "/admin/exports", icon: "download", perm: ["reports:export"] },
      { label: "Audit log", href: "/admin/audit-log", icon: "shield", perm: ["audit:read"] },
      { label: "Settings", href: "/admin/settings", icon: "settings", perm: ["settings:manage"] },
    ],
  },
];

export const EDITOR_NAV: NavGroup[] = [
  {
    items: [
      { label: "My work", href: "/editor", icon: "dashboard", exact: true },
      { label: "Projects", href: "/editor/projects", icon: "film" },
      { label: "Tasks", href: "/editor/tasks", icon: "checklist" },
      { label: "Revisions", href: "/editor/revisions", icon: "refresh" },
      { label: "Files", href: "/editor/files", icon: "folder" },
    ],
  },
];

export const filterNav = (groups: NavGroup[], perms: Set<string>): NavGroup[] =>
  groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || i.perm.some((p) => perms.has(p))) }))
    .filter((g) => g.items.length);

export function commandsFor(area: "admin" | "editor" | "client", groups: NavGroup[], perms: Set<string>): Command[] {
  const go: Command[] = groups.flatMap((g) => g.items).map((i) => ({ id: `go:${i.href}`, label: i.label, icon: i.icon, href: i.href, group: "Go to" as const }));
  const create: Command[] = [];
  if (area === "admin") {
    if (perms.has("projects:write")) create.push({ id: "c:project", label: "New project", icon: "plus", href: "/admin/projects/new", group: "Create" });
    if (perms.has("clients:write")) create.push({ id: "c:client", label: "New client", icon: "plus", href: "/admin/clients/new", group: "Create" });
    if (perms.has("quotes:write")) create.push({ id: "c:quote", label: "New quote", icon: "plus", href: "/admin/quotes/new", group: "Create" });
    if (perms.has("invoices:write")) create.push({ id: "c:invoice", label: "New invoice", icon: "plus", href: "/admin/invoices/new", group: "Create" });
    if (perms.has("tasks:write")) create.push({ id: "c:task", label: "New task", icon: "plus", href: "/admin/tasks?new=1", group: "Create" });
  }
  if (area === "client") create.push({ id: "c:request", label: "Request a new project", icon: "plus", href: "/start-project", group: "Create" });
  return [...create, ...go];
}
