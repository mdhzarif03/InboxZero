"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Turns the one-shot status query params that server-action redirects carry
 * (?notice=, ?error=, ?synced=1) into toasts, then removes them from the URL so a refresh does not repeat them.
 * The Gmail page renders its own persistent banner for its params, so it is skipped here.
 */
export function FlashToast() {
  const pathname = usePathname();
  const params = useSearchParams();
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (pathname === "/gmail") return;
    const notice = params.get("notice");
    const error = params.get("error");
    const synced = params.get("synced");
    if (!notice && !error && !synced) return;

    const key = `${pathname}|${notice ?? ""}|${error ?? ""}|${synced ?? ""}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    if (error) toast.error(error, { id: key });
    else if (notice) toast.success(notice, { id: key });
    else if (synced) toast.success("Mailbox synchronized.", { id: key });

    const next = new URLSearchParams(params.toString());
    ["notice", "error", "synced"].forEach((k) => next.delete(k));
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, params]);

  return null;
}
