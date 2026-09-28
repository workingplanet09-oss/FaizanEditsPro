"use client";
import { Button } from "@/components/ui/button";
export function PrintButton({ label = "Print / save PDF" }: { label?: string }) {
  return <Button variant="outline" icon="download" onClick={() => window.print()} className="print:hidden">{label}</Button>;
}
