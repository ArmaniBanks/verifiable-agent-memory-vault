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

    if (!isVaultPayload(body.payload)) {
      return NextResponse.json({ error: "A valid pending vault payload is required." }, { status: 400 });
    }

    const result = await uploadPayloadTo0G(body.payload, { allowPendingFallback: false });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown restore upload error";
    return NextResponse.json(
      {
        restored: false,
        storageStatus: "pending",
        error: message
      },
      { status: 503 }
    );
  }
}

