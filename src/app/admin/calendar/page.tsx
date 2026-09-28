import { requirePageActor, can } from "@/server/auth/actor";
import { calendarEvents } from "@/server/services/analytics";
import { listClients } from "@/server/services/clients";
import { first, type SearchParams } from "@/server/page";
import { PageHeader } from "@/components/ui/primitives";
import { CalendarView, startOfWeek } from "@/components/admin/calendar-view";
import { ScheduleCall } from "@/components/admin/schedule-call";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Calendar", path: "/admin/calendar", noindex: true });

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/calendar");
  const sp = await searchParams;
  const view = (["month", "week", "day"].includes(first(sp.view) ?? "") ? first(sp.view) : "month") as "month" | "week" | "day";
  const d = first(sp.date) && /^\d{4}-\d{2}-\d{2}$/.test(first(sp.date)!) ? new Date(`${first(sp.date)}T12:00:00`) : new Date();
  const from = view === "month" ? startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1)) : view === "week" ? startOfWeek(d) : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const to = view === "month" ? new Date(from.getFullYear(), from.getMonth(), from.getDate() + 42) : view === "week" ? new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7) : new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  const [events, clients] = await Promise.all([calendarEvents(actor, from, to), can(actor, "clients:read") ? listClients(actor, { pageSize: 200, sort: "name" }) : Promise.resolve({ items: [] as any[] })]);
  return (
    <>
      <PageHeader title="Calendar" description="Deadlines, calls, project starts, retainer renewals and task due dates in one view." actions={can(actor, "leads:write") ? <ScheduleCall clients={clients.items.map((c: any) => ({ id: c.id, label: c.companyName }))} /> : null} />
      <CalendarView view={view} date={d} events={events} base="/admin/calendar" />
    </>
  );
}
