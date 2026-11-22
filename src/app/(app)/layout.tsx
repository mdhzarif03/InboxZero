import { Suspense } from "react";
import { requireUser, signOut } from "@/lib/auth";
import { SampleDataBanner } from "@/components/sample-data-banner";
import { AppShell } from "@/components/app-shell";
import { FlashToast } from "@/components/flash-toast";

async function logout() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell
      email={user.email}
      signOutAction={logout}
      banner={
        <Suspense fallback={null}>
          <SampleDataBanner userId={user.id} />
        </Suspense>
      }
    >
      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
      {children}
    </AppShell>
  );
}
