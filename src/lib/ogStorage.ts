import { createHash } from "crypto";
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { ogConfig } from "./config";

export type VaultPayloadKind = "agent-metadata" | "memory" | "execution-log";

export type VaultPayload = {
  schema: "verifiable-agent-memory-vault/v1";
  kind: VaultPayloadKind;
  agentId?: string;
  name?: string;
  description?: string;
  memoryType?: string;
  content: string;
  author?: string;
  createdAt: string;
};

export type UploadResult = {
  rootHash: string;
  txHash: string;
  contentHash: string;
  bytes: number;
  storageStatus: "uploaded" | "pending";
  storageError?: string;
  payload: VaultPayload;
};

export type UploadMode = {
  allowPendingFallback?: boolean;
};

export const serverRpcUrl =
  process.env.SERVER_0G_RPC_URL || process.env.NEXT_PUBLIC_0G_RPC_URL || ogConfig.rpcUrl;

export const serverStorageIndexerUrl =
  process.env.SERVER_0G_STORAGE_INDEXER_URL ||
  process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER_URL ||
  ogConfig.storageIndexerUrl;

export const serverStorageIndexerUrls = (
  process.env.SERVER_0G_STORAGE_INDEXER_URLS ||
  [
    serverStorageIndexerUrl,
    "http://127.0.0.1:18546",
    "http://indexer-storage-turbo.0g.ai"
  ].join(",")
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean)
  .filter((url, index, urls) => urls.indexOf(url) === index);

function requireServerSigner() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required for server-side 0G Storage uploads.");
  }

  const provider = new ethers.JsonRpcProvider(serverRpcUrl, ogConfig.chainId, {
    staticNetwork: true
  });
  return new ethers.Wallet(privateKey, provider);
}

export function canonicalizePayload(payload: VaultPayload) {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

export function sha256Hex(input: Uint8Array | string) {
  return `0x${createHash("sha256").update(input).digest("hex")}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isNetworkTimeout(error: unknown) {
  const message = errorMessage(error);
  return /socket connection timeout|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|forbidden/i.test(message);
}

export async function uploadPayloadTo0G(payload: VaultPayload, mode: UploadMode = {}): Promise<UploadResult> {
  const allowPendingFallback = mode.allowPendingFallback ?? true;
  const signer = requireServerSigner();
  const body = canonicalizePayload(payload);
  const data = new TextEncoder().encode(body);
  const memData = new MemData(data);

  const [tree, treeErr] = await memData.merkleTree();
  if (treeErr !== null) {
    throw new Error(`0G merkle tree error: ${treeErr}`);
  }

  const contentHash = sha256Hex(data);
  const computedRootHash = tree?.rootHash() || contentHash;

  console.info("[VAMV debug] storage-upload-start", {
    kind: payload.kind,
    agentId: payload.agentId,
    bytes: data.byteLength,
    rootHash: computedRootHash,
    contentHash,
    indexers: serverStorageIndexerUrls
  });

  let tx;
  const attemptedIndexerErrors: string[] = [];

  try {
    for (const indexerUrl of serverStorageIndexerUrls) {
      try {
        console.info("[VAMV debug] storage-indexer-attempt", {
          indexerUrl,
          rootHash: computedRootHash,
          contentHash
        });
        const indexer = new Indexer(indexerUrl);
        const [uploadTx, uploadErr] = await indexer.upload(memData, serverRpcUrl, signer, {
          finalityRequired: true,
          expectedReplica: 1
        });
        if (uploadErr !== null) {
          throw new Error(`0G upload error via ${indexerUrl}: ${uploadErr.message || uploadErr}`);
        }
        tx = uploadTx;
        console.info("[VAMV debug] storage-indexer-success", {
          indexerUrl,
          rootHash: "rootHash" in uploadTx ? uploadTx.rootHash : computedRootHash,
          txHash: "txHash" in uploadTx ? uploadTx.txHash : undefined
        });
        break;
      } catch (error) {
        attemptedIndexerErrors.push(`${indexerUrl}: ${errorMessage(error)}`);
        console.info("[VAMV debug] storage-indexer-error", {
          indexerUrl,
          rootHash: computedRootHash,
          contentHash,
          error: errorMessage(error)
        });
        if (!isNetworkTimeout(error)) {
          throw error;
        }
      }
    }

    if (!tx) {
      throw new Error(attemptedIndexerErrors.join(" | ") || "No 0G Storage indexers were attempted.");
    }
  } catch (error) {
    if (!isNetworkTimeout(error) || !allowPendingFallback) {
      throw error;
    }

    const message = attemptedIndexerErrors.length > 0 ? attemptedIndexerErrors.join(" | ") : errorMessage(error);
    return {
      rootHash: computedRootHash,
      txHash: `storage-pending:${contentHash.slice(2, 18)}`,
      contentHash,
      bytes: data.byteLength,
      storageStatus: "pending",
      storageError: `0G Storage indexer unreachable from local server: ${message}`,
      payload
    };
  }

  if (!("rootHash" in tx)) {
    throw new Error("Unexpected fragmented upload response for small in-memory payload.");
  }

  return {
    rootHash: tx.rootHash || tree?.rootHash() || "",
    txHash: tx.txHash,
    contentHash,
    bytes: data.byteLength,
    storageStatus: "uploaded",
    payload
  };
}

export async function downloadPayloadFrom0G(rootHash: string) {
  const errors: string[] = [];
  let blob: globalThis.Blob | null = null;

  for (const indexerUrl of serverStorageIndexerUrls) {
    console.info("[VAMV debug] storage-download-attempt", {
      indexerUrl,
      rootHash
    });
    const indexer = new Indexer(indexerUrl);
    const [downloadedBlob, err] = await indexer.downloadToBlob(rootHash, { proof: true });
    if (err === null) {
      blob = downloadedBlob;
      console.info("[VAMV debug] storage-download-success", {
        indexerUrl,
        rootHash
      });
      break;
    }
    errors.push(`${indexerUrl}: ${err.message || err}`);
    console.info("[VAMV debug] storage-download-error", {
      indexerUrl,
      rootHash,
      error: err.message || String(err)
    });
  }

  if (!blob) {
    throw new Error(`0G proof download error: ${errors.join(" | ")}`);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const raw = new TextDecoder().decode(bytes);
  const contentHash = sha256Hex(bytes);
  return {
    raw,
    contentHash,
    payload: JSON.parse(raw) as VaultPayload
  };
}
