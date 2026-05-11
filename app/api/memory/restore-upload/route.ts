import { NextResponse } from "next/server";
import { uploadPayloadTo0G, type VaultPayload } from "@/src/lib/ogStorage";

export const runtime = "nodejs";

type RestoreRequest = {
  payload: VaultPayload;
};

function isVaultPayload(payload: unknown): payload is VaultPayload {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<VaultPayload>;
  return (
    value.schema === "verifiable-agent-memory-vault/v1" &&
    typeof value.kind === "string" &&
    ["agent-metadata", "memory", "execution-log"].includes(value.kind) &&
    typeof value.content === "string" &&
    typeof value.createdAt === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RestoreRequest;
    console.info("[VAMV debug] restore-api-request", {
      kind: body.payload?.kind,
      agentId: body.payload?.agentId,
      contentBytes: body.payload?.content?.length ?? 0
    });

    if (!isVaultPayload(body.payload)) {
      return NextResponse.json({ error: "A valid pending vault payload is required." }, { status: 400 });
    }

    const result = await uploadPayloadTo0G(body.payload, { allowPendingFallback: false });
    console.info("[VAMV debug] restore-api-result", {
      rootHash: result.rootHash,
      contentHash: result.contentHash,
      storageStatus: result.storageStatus,
      txHash: result.txHash
    });
    return NextResponse.json(result);
  } catch (error) {
    console.info("[VAMV debug] restore-api-error", {
      error: error instanceof Error ? error.message : "Unknown restore upload error"
    });
    return NextResponse.json(
      {
        restored: false,
        storageStatus: "fallback",
        error: "indexer unavailable",
        detail: error instanceof Error ? error.message : "Unknown restore upload error"
      }
    );
  }
}
