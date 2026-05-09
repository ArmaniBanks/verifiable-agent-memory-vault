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
            "This artifact is content-addressed locally because the 0G Storage indexer was unreachable during upload. Retry upload when the indexer is reachable to get a downloadable 0G Storage proof."
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
    const message = error instanceof Error ? error.message : "Unknown verification error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
