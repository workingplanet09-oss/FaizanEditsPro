import { notFound } from "next/navigation";
import { PageHero, Section } from "@/components/site/section";
import { BookingForm } from "@/components/site/booking-form";
import { getPublicSettings } from "@/server/services/public";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Book a call", description: "Book a discovery call, project consultation or strategy call.", path: "/book" });

export default async function BookPage() {
  const { booking } = await getPublicSettings(["booking"]);
  if (!booking.enabled) notFound();
  const types = Object.entries(booking.types).map(([key, t]) => ({ key, ...t }));
  return (
    <>
      <PageHero eyebrow="Book a call" title="Pick a time that works for you." description="A relaxed conversation about your content, your goals and what the right setup looks like — no pressure." />
      <Section>
        <div className="mx-auto max-w-3xl rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-soft sm:p-10">
          <BookingForm types={types} />
        </div>
      </Section>
    </>
  );
}
