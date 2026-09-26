import { NextResponse } from "next/server";
import { explainFinding } from "../../../lib/watsonx";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { finding?: unknown };
    const finding = typeof body.finding === "string" ? body.finding.trim() : "";
    if (!finding) return NextResponse.json({ error: "Finding is required." }, { status: 400 });
    return NextResponse.json(await explainFinding(finding));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to explain finding.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
