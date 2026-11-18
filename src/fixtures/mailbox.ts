/**
 * SAMPLE DATA ONLY. Used by scripts/seed-fixtures.ts for local development and tests.
 * Stored under a ConnectedAccount with provider "fixture", which the UI labels as sample data
 * and the sync engine refuses to synchronize. Never presented as real Gmail content.
 */
export const FIXTURE_OWNER_ADDRESS = "sample.owner@inboxzero.invalid";

export type FixtureMessage = {
  id: string;
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  sentAt: string; // ISO
  subject: string;
  body: string;
  unread?: boolean;
  listUnsubscribe?: boolean;
};

export type FixtureThread = { id: string; messages: FixtureMessage[]; labels?: string[] };

export const FIXTURE_THREADS: FixtureThread[] = [
  {
    id: "fx-thread-admission",
    labels: ["INBOX", "IMPORTANT", "UNREAD"],
    messages: [
      {
        id: "fx-m1",
        from: "admissions@northfield.example",
        fromName: "Northfield Admissions",
        to: [FIXTURE_OWNER_ADDRESS],
        sentAt: "2026-11-10T09:12:00Z",
        subject: "Scholarship documents needed",
        unread: true,
        body:
          "Dear applicant,\n\nPlease submit your transcript and the signed scholarship form by 30 November 2026.\n" +
          "Could you also confirm whether you will attend the orientation call on December 4, 2026 at 10:00 AM GMT?\n\nRegards,\nAdmissions Office",
      },
    ],
  },
  {
    id: "fx-thread-invoice",
    labels: ["INBOX", "UNREAD"],
    messages: [
      {
        id: "fx-m2",
        from: "billing@cloudhost.example",
        fromName: "CloudHost Billing",
        to: [FIXTURE_OWNER_ADDRESS],
        sentAt: "2026-11-12T14:00:00Z",
        subject: "Invoice INV-2291 payment due",
        unread: true,
        body: "Your invoice INV-2291 is ready. Payment due on 2026-12-01. Please pay before the due date to avoid suspension.",
      },
    ],
  },
  {
    id: "fx-thread-waiting",
    labels: ["INBOX", "SENT"],
    messages: [
      {
        id: "fx-m3a",
        from: FIXTURE_OWNER_ADDRESS,
        fromName: "You",
        to: ["client@brightwork.example"],
        sentAt: "2026-11-06T08:30:00Z",
        subject: "Proposal for the website redesign",
        body: "Hi Sara,\n\nAttached is the proposal. Could you let me know whether the timeline works for you?\n\nThanks,\nSample Owner",
      },
    ],
  },
  {
    id: "fx-thread-newsletter",
    labels: ["INBOX", "CATEGORY_UPDATES"],
    messages: [
      {
        id: "fx-m4",
        from: "digest@productweekly.example",
        fromName: "Product Weekly",
        to: [FIXTURE_OWNER_ADDRESS],
        sentAt: "2026-11-14T06:00:00Z",
        subject: "Weekly digest: 10 product ideas",
        listUnsubscribe: true,
        body: "This week's edition covers onboarding patterns, pricing pages and more. Read the full issue online.",
      },
    ],
  },
  {
    id: "fx-thread-notification",
    labels: ["INBOX"],
    messages: [
      {
        id: "fx-m5",
        from: "no-reply@repo-host.example",
        fromName: "Repo Host",
        to: [FIXTURE_OWNER_ADDRESS],
        sentAt: "2026-11-15T11:20:00Z",
        subject: "Build #482 passed",
        body: "Your build on main completed successfully.",
      },
    ],
  },
  {
    id: "fx-thread-meeting",
    labels: ["INBOX", "STARRED"],
    messages: [
      {
        id: "fx-m6a",
        from: "colleague@partner.example",
        fromName: "Partner Colleague",
        to: [FIXTURE_OWNER_ADDRESS],
        sentAt: "2026-11-16T10:00:00Z",
        subject: "Demo next week?",
        body: "Can you please confirm a demo slot for the week of November 23? Let me know what works.",
      },
    ],
  },
];
