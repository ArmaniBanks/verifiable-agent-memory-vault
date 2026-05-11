import { NextResponse } from "next/server";
import { downloadPayloadFrom0G } from "@/src/lib/ogStorage";

export const runtime = "nodejs";

type VerifyRequest = {
  rootHash: string;
  expectedContentHash?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyRequest;
    console.info("[VAMV debug] verify-api-request", {
      rootHash: body.rootHash,
      expectedContentHash: body.expectedContentHash
    });

    if (!body.rootHash || !body.rootHash.startsWith("0x")) {
      return NextResponse.json({ error: "A valid 0G storage root hash is required." }, { status: 400 });
    }

    const downloaded = await downloadPayloadFrom0G(body.rootHash);
    const matchesExpected = body.expectedContentHash
      ? downloaded.contentHash.toLowerCase() === body.expectedContentHash.toLowerCase()
      : null;

    console.info("[VAMV debug] verify-api-result", {
      rootHash: body.rootHash,
      contentHash: downloaded.contentHash,
      matchesExpected,
      verified: matchesExpected === null ? true : matchesExpected
    });

    return NextResponse.json({
      verified: matchesExpected === null ? true : matchesExpected,
      rootHash: body.rootHash,
      contentHash: downloaded.contentHash,
      matchesExpected,
      payload: downloaded.payload,
      raw: downloaded.raw
    });
  } catch (error) {
    console.info("[VAMV debug] verify-api-error", {
      error: error instanceof Error ? error.message : "Unknown verification error"
    });
    return NextResponse.json(
      {
        verified: false,
        error: "indexer unavailable",
        detail: error instanceof Error ? error.message : "Unknown verification error"
      }
    );
  }
}
