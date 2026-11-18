"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Submit button that shows a pending state while its form action runs.
 * Gives every server-action form immediate feedback, so slow syncs do not look like dead buttons.
 */
export function SubmitButton({ pendingLabel, children, disabled, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  // Spread first, then the computed flags, so a caller cannot re-enable a button while it is pending.
  return (
    <Button {...props} type="submit" aria-busy={pending} disabled={pending || Boolean(disabled)}>
      {pending ? (
        <>
          <span aria-hidden="true" className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
          {pendingLabel ?? "Working…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
