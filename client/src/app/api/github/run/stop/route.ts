import { NextResponse } from "next/server";
import { stopRun } from "@/lib/repoRunner";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(stopRun());
}
