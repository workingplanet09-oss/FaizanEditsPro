import { requirePageActor, can, denyPage } from "@/server/auth/actor";
import { cmsList } from "@/server/services/cms";
import { getSetting } from "@/server/services/settings";
import { guard, first, type SearchParams } from "@/server/page";
import { RESOURCES } from "@/lib/cms-resources";
import { PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { CmsManager, type ResourceLite } from "@/components/admin/cms-manager";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Website content", path: "/admin/content", noindex: true });

const ICON: Record<string, string> = { services: "clapperboard", "pricing-plans": "wallet", portfolio: "film", "case-studies": "book", testimonials: "quote", "blog-posts": "news", "blog-categories": "folder", faqs: "help", "kb-articles": "book", "project-types": "layers", "project-templates": "checklist", "email-templates": "mail" };

export default async function ContentPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/content");
  if (!can(actor, "cms:manage")) denyPage();
  const sp = await searchParams;
  const key = first(sp.r) && RESOURCES[first(sp.r)!] ? first(sp.r)! : "services";
  const def = RESOURCES[key];
  const [list, business] = await guard(() => Promise.all([cmsList(actor, key, { pageSize: 200 }), getSetting(actor.workspaceId, "business")]));
  // options for relation fields (e.g. blog category, service on a template)
  const relKeys = [...new Set(def.fields.filter((f) => f.type === "relation" && f.relation).map((f) => f.relation!))];
  const relations: Record<string, { value: string; label: string }[]> = {};
  for (const rk of relKeys) {
    const rdef = RESOURCES[rk];
    const rl = await cmsList(actor, rk, { pageSize: 200 });
    relations[rk] = rl.items.map((r: any) => ({ value: r.id, label: String(r[rdef.titleField] ?? r.id) }));
  }
  const lite: ResourceLite = { key: def.key, label: def.label, singular: def.singular, description: def.description, titleField: def.titleField, subtitleField: def.subtitleField, flagField: def.flagField, sortable: def.sortable, allowCreate: def.allowCreate, allowDelete: def.allowDelete, allowDuplicate: def.allowDuplicate, fields: def.fields, defaults: def.defaults };
  const items = list.items.map((r: any) => ({ ...r, _href: def.publicPath ? def.publicPath(r) : null }));
  return (
    <>
      <PageHeader title="Website content" description="Everything visitors see: services, pricing, portfolio, case studies, testimonials, blog, FAQs and more. Sample entries are labelled and can be removed any time." />
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Content types" className="thin-scroll -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0">
          {Object.values(RESOURCES).map((r) => (
            <Link key={r.key} href={`/admin/content?r=${r.key}`} aria-current={r.key === key ? "page" : undefined} className={cn("flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition", r.key === key ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg")}>
              <Icon name={ICON[r.key] ?? "news"} size={16} className={r.key === key ? "text-accent" : "text-subtle"} />{r.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          <h2 className="mb-1 text-xl font-extrabold">{def.label}</h2>
          <p className="mb-5 text-sm text-muted">{def.description}</p>
          <CmsManager resource={lite} items={items} total={list.total} relations={relations} currencyDefault={business.defaultCurrency} />
        </div>
      </div>
    </>
  );
}
