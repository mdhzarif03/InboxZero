import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/auth";
import { exportUserData } from "@/lib/privacy/account";

/** Downloads everything stored about the signed-in user as JSON. */
export async function GET() {
  const user = await getUserOrNull();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="inboxzero-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
