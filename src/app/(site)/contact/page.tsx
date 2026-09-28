import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHero, Section } from "@/components/site/section";
import { ContactForm } from "@/components/site/contact-form";
import { getSiteContext } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Contact", description: "Get in touch about a project, a partnership, or working together.", path: "/contact" });

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const site = await getSiteContext();
  const valid = ["GENERAL", "PROJECT", "PARTNERSHIP", "AGENCY", "CAREER"];
  const socials = Object.entries(site.business.socials).filter(([, v]) => v);
  return (
    <>
      <PageHero eyebrow="Contact" title={site.contactInfo.heading} description={site.contactInfo.intro} />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft sm:p-9">
            <ContactForm defaultReason={reason && valid.includes(reason.toUpperCase()) ? reason.toUpperCase() : "GENERAL"} />
          </div>
          <aside className="space-y-5">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
              <Icon name="clock" size={20} className="text-accent" />
              <h2 className="mt-3 font-extrabold">Response time</h2>
              <p className="mt-1 text-sm text-muted">{site.contactInfo.responseTime}</p>
            </div>
            {site.booking.enabled ? (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
                <Icon name="calendar" size={20} className="text-accent" />
                <h2 className="mt-3 font-extrabold">Prefer to talk?</h2>
                <p className="mt-1 text-sm text-muted">Book a free discovery call and pick a time that suits you.</p>
                <ButtonLink href="/book" variant="outline" size="sm" className="mt-4">Book a call</ButtonLink>
              </div>
            ) : null}
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 text-sm">
              <h2 className="font-extrabold">Direct</h2>
              <ul className="mt-3 space-y-2.5 text-muted">
                {site.business.email ? <li className="flex gap-2.5"><Icon name="mail" size={16} className="mt-0.5" /><a className="hover:text-fg" href={`mailto:${site.business.email}`}>{site.business.email}</a></li> : null}
                {site.business.phone ? <li className="flex gap-2.5"><Icon name="phone" size={16} className="mt-0.5" />{site.business.phone}</li> : null}
                {site.business.address ? <li className="flex gap-2.5"><Icon name="globe" size={16} className="mt-0.5" />{site.business.address}</li> : null}
                {socials.map(([k, v]) => <li key={k} className="flex gap-2.5"><Icon name="link" size={16} className="mt-0.5" /><a className="capitalize hover:text-fg" href={v} target="_blank" rel="noopener noreferrer">{k}</a></li>)}
              </ul>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
