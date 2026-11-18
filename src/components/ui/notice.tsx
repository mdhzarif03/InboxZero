import { cn } from "@/lib/utils";

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "error" && "border-destructive/40 text-destructive",
        tone === "success" && "border-border text-foreground",
        tone === "info" && "border-border text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
