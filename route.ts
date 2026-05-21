import { NextResponse } from "next/server";
import { uploadPayloadTo0G, type VaultPayload, type VaultPayloadKind } from "@/src/lib/ogStorage";

export const runtime = "nodejs";

type UploadRequest = {
  kind: VaultPayloadKind;
  content: string;
  agentId?: string;
  name?: string;
  description?: string;
  memoryType?: string;
  author?: string;
  foundry?: {
    ingotId?: string;
    inferenceTxHash?: string;
    revenueTxHash?: string;
    attestation?: string;
    receiptSource?: "manual" | "foundry";
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadRequest;
    console.info("[VAMV debug] upload-api-request", {
      kind: body.kind,
      agentId: body.agentId,
      memoryType: body.memoryType,
      contentBytes: body.content?.length ?? 0
    });

    if (!body.kind || !["agent-metadata", "memory", "execution-log"].includes(body.kind)) {
      return NextResponse.json({ error: "Invalid payload kind." }, { status: 400 });
    }

    if (!body.content || body.content.trim().length < 3) {
      return NextResponse.json({ error: "Content must be at least 3 characters." }, { status: 400 });
    }

    const vaultPayload: VaultPayload = {
      schema: "verifiable-agent-memory-vault/v1",
      kind: body.kind,
      agentId: body.agentId,
      name: body.name,
      description: body.description,
      memoryType: body.memoryType,
      content: body.content,
      author: body.author,
      createdAt: new Date().toISOString()
    };

    const payloadWithFoundry = body.foundry ? { ...vaultPayload, foundry: body.foundry } : vaultPayload;

    const result = await uploadPayloadTo0G(payloadWithFoundry);

    console.info("[VAMV debug] upload-api-result", {
      rootHash: result.rootHash,
      contentHash: result.contentHash,
      storageStatus: result.storageStatus,
      txHash: result.txHash,
      storageError: result.storageError
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload error";
    console.info("[VAMV debug] upload-api-error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
