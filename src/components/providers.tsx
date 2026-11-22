"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/** Client-side providers: theme (class strategy, system default), tooltips, and toasts. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={150}>
        {children}
        <Toaster
          position="bottom-right"
          closeButton
          richColors={false}
          toastOptions={{
            classNames: {
              toast:
                "!rounded-xl !border !border-border !bg-popover !text-popover-foreground !shadow-elevated !font-sans !text-sm",
              description: "!text-muted-foreground",
              closeButton: "!border-border !bg-popover !text-muted-foreground",
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
