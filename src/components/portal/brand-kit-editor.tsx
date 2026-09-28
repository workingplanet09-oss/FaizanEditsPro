"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader } from "@/components/ui/primitives";
import { formatBytes } from "@/lib/format";
import { Uploader } from "./uploader";
import { useRouter } from "next/navigation";

type Role = "none" | "logo" | "alt" | "guidelines" | "intro" | "outro" | "watermark" | "lower";
export interface BrandKitData {
  colors: { name: string; hex: string }[];
  fonts: { name: string; usage?: string }[];
  typographyRules: string;
  musicPreference: string;
  websiteUrl: string;
  socialHandles: Record<string, string>;
  logoAssetId: string | null;
  guidelinesAssetId: string | null;
  introAssetId: string | null;
  outroAssetId: string | null;
  watermarkAssetId: string | null;
  altLogoAssetIds: string[];
  lowerThirdAssetIds: string[];
}
const ROLE_LABEL: Record<Role, string> = { none: "Unassigned", logo: "Primary logo", alt: "Alternate logo", guidelines: "Brand guidelines", intro: "Intro", outro: "Outro", watermark: "Watermark", lower: "Lower third" };
const SOCIALS = ["instagram", "youtube", "tiktok", "linkedin", "x"];

export function BrandKitEditor({ clientId, kit, assets, canEdit }: { clientId: string; kit: BrandKitData; assets: { id: string; displayName: string; mimeType: string; sizeBytes: number }[]; canEdit: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [colors, setColors] = useState(kit.colors);
  const [fonts, setFonts] = useState(kit.fonts);
  const [rules, setRules] = useState(kit.typographyRules);
  const [music, setMusic] = useState(kit.musicPreference);
  const [site, setSite] = useState(kit.websiteUrl);
  const [social, setSocial] = useState(kit.socialHandles);
  const roleOf = (id: string): Role => (kit.logoAssetId === id ? "logo" : kit.guidelinesAssetId === id ? "guidelines" : kit.introAssetId === id ? "intro" : kit.outroAssetId === id ? "outro" : kit.watermarkAssetId === id ? "watermark" : kit.altLogoAssetIds.includes(id) ? "alt" : kit.lowerThirdAssetIds.includes(id) ? "lower" : "none");
  const [roles, setRoles] = useState<Record<string, Role>>(() => Object.fromEntries(assets.map((a) => [a.id, roleOf(a.id)])));
  const ids = (r: Role) => Object.entries(roles).filter(([, v]) => v === r).map(([k]) => k);

  const save = useAction(
    async () =>
      api(`/api/clients/${clientId}/brand-kit`, {
        method: "PUT",
        body: {
          colors: colors.filter((c) => c.hex),
          fonts: fonts.filter((f) => f.name.trim()),
          typographyRules: rules || null,
          musicPreference: music || null,
          websiteUrl: site || null,
          socialHandles: Object.fromEntries(Object.entries(social).filter(([, v]) => v)),
          logoAssetId: ids("logo")[0] ?? null,
          guidelinesAssetId: ids("guidelines")[0] ?? null,
          introAssetId: ids("intro")[0] ?? null,
          outroAssetId: ids("outro")[0] ?? null,
          watermarkAssetId: ids("watermark")[0] ?? null,
          altLogoAssetIds: ids("alt"),
          lowerThirdAssetIds: ids("lower"),
        },
      }),
    { onSuccess: () => toast.success("Brand kit saved", "Editors will use it on every project."), onError: (e) => toast.error("Couldn't save", e.message) },
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Brand files" description="Upload once — every project uses them automatically. Assign a role so editors know what each file is for." />
        <div className="space-y-4 px-5 pb-6">
          {canEdit ? <Uploader purpose="brand" clientId={clientId} compact title="Drop logos, guidelines, intro/outro clips…" onAllDone={() => router.refresh()} /> : null}
          {assets.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {assets.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Icon name={a.mimeType.startsWith("image/") ? "image" : a.mimeType.startsWith("video/") ? "video" : "file"} size={18} className="text-muted" />
                  <div className="min-w-0 flex-1 basis-40"><div className="truncate text-sm font-semibold">{a.displayName}</div><div className="text-xs text-subtle">{formatBytes(a.sizeBytes)}</div></div>
                  <label className="sr-only" htmlFor={`role-${a.id}`}>Role of {a.displayName}</label>
                  <select id={`role-${a.id}`} disabled={!canEdit} value={roles[a.id] ?? "none"} onChange={(e) => setRoles({ ...roles, [a.id]: e.target.value as Role })} className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-medium">
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No brand files yet.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Colours" description="Hex values editors can copy straight into titles and graphics." />
        <div className="space-y-3 px-5 pb-6">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="color" aria-label={`Colour ${i + 1}`} disabled={!canEdit} value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#000000"} onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface p-1" />
              <Input aria-label="Colour name" disabled={!canEdit} value={c.name} placeholder="Name (e.g. Primary)" onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="max-w-48" />
              <Input aria-label="Hex" disabled={!canEdit} value={c.hex} onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} className="max-w-32 font-mono" />
              {canEdit ? <Button variant="ghost" size="sm" icon="trash" aria-label="Remove colour" onClick={() => setColors(colors.filter((_, j) => j !== i))} /> : null}
            </div>
          ))}
          {canEdit && colors.length < 12 ? <Button variant="outline" size="sm" icon="plus" onClick={() => setColors([...colors, { name: "", hex: "#" }])}>Add colour</Button> : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Typography" />
        <div className="space-y-3 px-5 pb-6">
          {fonts.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label="Font name" disabled={!canEdit} value={f.name} placeholder="Font (e.g. Montserrat Bold)" onChange={(e) => setFonts(fonts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="max-w-64" />
              <Input aria-label="Usage" disabled={!canEdit} value={f.usage ?? ""} placeholder="Used for (titles, captions…)" onChange={(e) => setFonts(fonts.map((x, j) => (j === i ? { ...x, usage: e.target.value } : x)))} className="max-w-64" />
              {canEdit ? <Button variant="ghost" size="sm" icon="trash" aria-label="Remove font" onClick={() => setFonts(fonts.filter((_, j) => j !== i))} /> : null}
            </div>
          ))}
          {canEdit && fonts.length < 8 ? <Button variant="outline" size="sm" icon="plus" onClick={() => setFonts([...fonts, { name: "", usage: "" }])}>Add font</Button> : null}
          <Field label="Typography rules">{(p) => <Textarea {...p} rows={2} disabled={!canEdit} value={rules} onChange={(e) => setRules(e.target.value)} placeholder="e.g. Titles in sentence case, never all-caps." />}</Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Style & links" />
        <div className="grid gap-4 px-5 pb-6 md:grid-cols-2">
          <Field label="Music preferences" className="md:col-span-2">{(p) => <Textarea {...p} rows={2} disabled={!canEdit} value={music} onChange={(e) => setMusic(e.target.value)} placeholder="Genres, artists, licensing libraries you already pay for…" />}</Field>
          <Field label="Website" className="md:col-span-2">{(p) => <Input {...p} type="url" disabled={!canEdit} value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://" />}</Field>
          {SOCIALS.map((s) => <Field key={s} label={s === "x" ? "X / Twitter" : s[0].toUpperCase() + s.slice(1)}>{(p) => <Input {...p} disabled={!canEdit} value={social[s] ?? ""} onChange={(e) => setSocial({ ...social, [s]: e.target.value })} placeholder="@handle or URL" />}</Field>)}
        </div>
      </Card>

      {canEdit ? (
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4"><Button size="lg" icon="check" loading={save.pending} onClick={() => void save.run()} className="shadow-lift">Save brand kit</Button></div>
      ) : <p className="text-sm text-muted">Only account owners and managers can edit the brand kit.</p>}
    </div>
  );
}
