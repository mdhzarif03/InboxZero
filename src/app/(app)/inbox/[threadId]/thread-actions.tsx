import { confirmDeadline, setActionStatus } from "@/lib/actions/user";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Per-item controls. Each form posts to a server action that re-checks ownership.
 * The wrappers return void and rely on revalidation, as required by form actions.
 */
export function ThreadActions({ kind, id }: { kind: "action" | "deadline"; id: string }) {
  if (kind === "deadline") {
    return (
      <form action={async (fd: FormData) => { "use server"; await confirmDeadline(fd); }} className="inline">
        <input type="hidden" name="id" value={id} />
        <SubmitButton variant="outline" size="sm">Confirm date</SubmitButton>
      </form>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <form action={async (fd: FormData) => { "use server"; await setActionStatus(fd); }}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="CONFIRMED" />
        <SubmitButton variant="outline" size="sm">Confirm</SubmitButton>
      </form>
      <form action={async (fd: FormData) => { "use server"; await setActionStatus(fd); }}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="COMPLETED" />
        <SubmitButton variant="outline" size="sm">Mark done</SubmitButton>
      </form>
      <form action={async (fd: FormData) => { "use server"; await setActionStatus(fd); }}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="DISMISSED" />
        <SubmitButton variant="ghost" size="sm">Not an action</SubmitButton>
      </form>
    </div>
  );
}
