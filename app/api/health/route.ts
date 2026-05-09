import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { ogConfig } from "@/src/lib/config";
import { serverRpcUrl, serverStorageIndexerUrl, serverStorageIndexerUrls } from "@/src/lib/ogStorage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(serverRpcUrl, ogConfig.chainId, {
      staticNetwork: true
    });
    const network = await provider.getNetwork();

    return NextResponse.json({
      ok: true,
      serverRpcUrl,
      serverStorageIndexerUrl,
      serverStorageIndexerUrls,
      chainId: Number(network.chainId),
      contractAddress: ogConfig.contractAddress,
      privateKeyLoaded: Boolean(process.env.PRIVATE_KEY)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        serverRpcUrl,
        serverStorageIndexerUrl,
        serverStorageIndexerUrls,
        contractAddress: ogConfig.contractAddress,
        error: error instanceof Error ? error.message : "Unknown health check error"
      },
      { status: 500 }
    );
  }
}
