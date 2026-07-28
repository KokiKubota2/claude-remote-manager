import { NextResponse, type NextRequest } from "next/server";
import { requireAuthApi } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export async function GET(request: NextRequest) {
  const unauthorized = requireAuthApi(request);
  if (unauthorized) return unauthorized;
  const { registry } = services();
  const projects = registry.listEnabled().map((p) => ({
    id: p.id,
    name: p.name,
    defaultBranch: p.defaultBranch,
    packageManager: p.packageManager,
  }));
  return NextResponse.json({ projects });
}
