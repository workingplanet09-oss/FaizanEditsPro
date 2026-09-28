"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { Button } from "./button";
import { ConfirmModal } from "./modal";
import { useToast } from "./toast";

type ButtonProps = Omit<React.ComponentProps<typeof Button>, "onClick" | "loading" | "children">;

/**
 * One-click mutation: optional confirmation dialog → API call → toast → router.refresh().
 * Every write in the app goes through the same API routes the rest of the product uses.
 */
export function ActionButton({
  url,
  method = "POST",
  body,
  children,
  success,
  confirm,
  onDone,
  refresh = true,
  ...button
}: ButtonProps & {
  url: string;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  children: React.ReactNode;
  success?: string;
  confirm?: { title: string; description?: string; confirmLabel?: string; tone?: "primary" | "danger" };
  onDone?: (result: any) => void;
  refresh?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const action = useAction(async () => api(url, { method, body: body ?? (method === "DELETE" ? undefined : {}) }), {
    refresh,
    onSuccess: (r) => {
      setOpen(false);
      if (success) toast.success(success);
      onDone?.(r);
    },
    onError: (e) => {
      setOpen(false);
      toast.error("That didn't work", e.message);
    },
  });
  return (
    <>
      <Button {...button} loading={action.pending && !open} onClick={() => (confirm ? setOpen(true) : void action.run())}>
        {children}
      </Button>
      {confirm ? (
        <ConfirmModal open={open} onClose={() => setOpen(false)} onConfirm={() => void action.run()} title={confirm.title} description={confirm.description} confirmLabel={confirm.confirmLabel} tone={confirm.tone} loading={action.pending} />
      ) : null}
    </>
  );
}
