import { MessageSquareText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { InboxAssistant } from "@/components/assistant/inbox-assistant";

export const metadata = { title: "Quick answers" };
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        icon={MessageSquareText}
        title="Quick answers"
        description="Find useful information in your synced conversations without sending email content to an external AI service."
      />
      <InboxAssistant />
      <p className="text-xs leading-relaxed text-muted-foreground">
        This is a rule-based mailbox query tool, not a generative AI chatbot. It handles common questions about actions, follow-ups, dates and recent conversations, plus keyword searches. For exact matches and sender or date filters, use Advanced search.
      </p>
    </div>
  );
}
