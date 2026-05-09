import { NextResponse } from "next/server";
import { uploadPayloadTo0G, type VaultPayloadKind } from "@/src/lib/ogStorage";

export const runtime = "nodejs";

type UploadRequest = {
  kind: VaultPayloadKind;
  content: string;
  agentId?: string;
  name?: string;
  description?: string;
  memoryType?: string;
  author?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadRequest;

    if (!body.kind || !["agent-metadata", "memory", "execution-log"].includes(body.kind)) {
      return NextResponse.json({ error: "Invalid payload kind." }, { status: 400 });
    }

    if (!body.content || body.content.trim().length < 3) {
      return NextResponse.json({ error: "Content must be at least 3 characters." }, { status: 400 });
    }

    const result = await uploadPayloadTo0G({
      schema: "verifiable-agent-memory-vault/v1",
      kind: body.kind,
      agentId: body.agentId,
      name: body.name,
      description: body.description,
      memoryType: body.memoryType,
      content: body.content,
      author: body.author,
      createdAt: new Date().toISOString()
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

