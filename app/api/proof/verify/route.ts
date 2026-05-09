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

    if (!body.rootHash || !body.rootHash.startsWith("0x")) {
      return NextResponse.json({ error: "A valid 0G storage root hash is required." }, { status: 400 });
    }

    if (body.expectedContentHash && body.rootHash.toLowerCase() === body.expectedContentHash.toLowerCase()) {
      return NextResponse.json(
        {
          verified: false,
          rootHash: body.rootHash,
          contentHash: body.expectedContentHash,
          matchesExpected: true,
          payload: null,
          pending: true,
          error:
            "Queued for 0G indexing. Fallback proof remains active while storage propagation completes."
        },
        { status: 409 }
      );
    }

    const downloaded = await downloadPayloadFrom0G(body.rootHash);
    const matchesExpected = body.expectedContentHash
      ? downloaded.contentHash.toLowerCase() === body.expectedContentHash.toLowerCase()
      : null;

    return NextResponse.json({
      verified: matchesExpected === null ? true : matchesExpected,
      rootHash: body.rootHash,
      contentHash: downloaded.contentHash,
      matchesExpected,
      payload: downloaded.payload,
      raw: downloaded.raw
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Storage propagation is still pending.",
        detail: error instanceof Error ? error.message : "Unknown verification error"
      },
      { status: 500 }
    );
  }
}
