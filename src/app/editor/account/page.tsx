import { requirePageActor } from "@/server/auth/actor";
import { AccountPage } from "@/components/admin/account-page";
import type { SearchParams } from "@/server/page";

export const metadata = { title: "My account", robots: { index: false, follow: false } };

export default async function Account({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("editor", "/editor/account");
  return <AccountPage actor={actor} base="/editor" sp={await searchParams} />;
}
