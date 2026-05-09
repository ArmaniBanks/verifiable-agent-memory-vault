"use client";

import { useMemo, useState } from "react";
import { Bot, CheckCircle2, Database, ExternalLink, FileCheck2, Link, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { BrowserProvider, Contract, Interface } from "ethers";
import { agentMemoryVaultAbi } from "@/src/lib/agentMemoryVaultAbi";
import { explorerAddressUrl, explorerTxUrl, ogConfig } from "@/src/lib/config";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

type UploadResponse = {
  rootHash: string;
  txHash: string;
  contentHash: string;
  bytes: number;
  storageStatus: "uploaded" | "pending";
  storageError?: string;
  payload: Record<string, unknown>;
};

type AgentView = {
  id: string;
  owner: string;
  name: string;
  description: string;
  metadataRootHash: string;
  memoryCount: string;
  active: boolean;
};

type VerificationResponse = {
  verified: boolean;
  rootHash: string;
  contentHash: string;
  matchesExpected: boolean | null;
  payload: Record<string, unknown>;
};

function shortHash(value: string) {
  if (!value) return "";
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

async function requireWallet() {
  if (!window.ethereum) {
    throw new Error("Install MetaMask or another EIP-1193 wallet to use this demo.");
  }

  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();

  if (Number(network.chainId) !== ogConfig.chainId) {
    const chainHex = `0x${ogConfig.chainId.toString(16)}`;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainHex }]
      });
    } catch {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainHex,
            chainName: ogConfig.chainName,
            nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
            rpcUrls: [ogConfig.rpcUrl],
            blockExplorerUrls: [ogConfig.explorerUrl]
          }
        ]
      });
    }
  }

  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

export function MemoryVaultApp() {
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [agentName, setAgentName] = useState("Research Sentinel");
  const [agentDescription, setAgentDescription] = useState(
    "An agent that remembers research notes and produces auditable execution logs."
  );
  const [agentId, setAgentId] = useState("");
  const [memoryType, setMemoryType] = useState("research-note");
  const [memoryContent, setMemoryContent] = useState(
    "Track the 0G APAC Hackathon rules, deadline, and submission checklist."
  );
  const [lastUpload, setLastUpload] = useState<UploadResponse | null>(null);
  const [lastTxHash, setLastTxHash] = useState("");
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [verifyRootHash, setVerifyRootHash] = useState("");
  const [verifyContentHash, setVerifyContentHash] = useState("");
  const [verification, setVerification] = useState<VerificationResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const contractReady = ogConfig.contractAddress.length > 0;

  const contractLink = useMemo(() => {
    return contractReady ? explorerAddressUrl(ogConfig.contractAddress) : "";
  }, [contractReady]);

  async function getContract() {
    if (!contractReady) {
      throw new Error("NEXT_PUBLIC_AGENT_MEMORY_VAULT_ADDRESS is not set. Deploy the contract first.");
    }

    const { signer, address } = await requireWallet();
    setAccount(address);
    return {
      contract: new Contract(ogConfig.contractAddress, agentMemoryVaultAbi, signer),
      address
    };
  }

  async function connectWallet() {
    setBusy(true);
    setError("");
    try {
      const { address } = await requireWallet();
      setAccount(address);
      setStatus("Wallet connected to 0G Mainnet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadArtifact(body: Record<string, unknown>) {
    const response = await fetch("/api/memory/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "0G upload failed.");
    }

    return payload as UploadResponse;
  }

  async function registerAgent() {
    setBusy(true);
    setError("");
    setStatus("Uploading agent metadata to 0G Storage...");

    try {
      const metadata = await uploadArtifact({
        kind: "agent-metadata",
        name: agentName,
        description: agentDescription,
        author: account,
        content: JSON.stringify({ name: agentName, description: agentDescription })
      });
      setLastUpload(metadata);
      setVerifyRootHash(metadata.rootHash);
      setVerifyContentHash(metadata.contentHash);
      if (metadata.storageStatus === "pending") {
        setStatus("0G Storage indexer is unreachable, using a pending content proof for chain registration...");
      }

      setStatus("Registering agent on 0G Chain...");
      const { contract } = await getContract();
      const tx = await contract.registerAgent(agentName, agentDescription, metadata.rootHash);
      setLastTxHash(tx.hash);
      const receipt = await tx.wait();
      const iface = new Interface(agentMemoryVaultAbi);
      const parsed = receipt.logs
        .map((log: unknown) => {
          try {
            return iface.parseLog(log as { topics: string[]; data: string });
          } catch {
            return null;
          }
        })
        .find((log: { name?: string } | null) => log?.name === "AgentRegistered");

      const createdId = parsed?.args?.agentId?.toString() || "";
      setAgentId(createdId);
      setStatus(
        metadata.storageStatus === "uploaded"
          ? `Agent #${createdId} registered and linked to 0G Storage.`
          : `Agent #${createdId} registered on 0G Chain. Storage upload is pending until the indexer is reachable.`
      );
      await loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function anchorMemory() {
    setBusy(true);
    setError("");
    setStatus("Uploading memory/log artifact to 0G Storage...");

    try {
      if (!agentId) throw new Error("Register or enter an agent ID first.");

      const upload = await uploadArtifact({
        kind: memoryType.includes("log") ? "execution-log" : "memory",
        agentId,
        memoryType,
        author: account,
        content: memoryContent
      });
      setLastUpload(upload);
      setVerifyRootHash(upload.rootHash);
      setVerifyContentHash(upload.contentHash);
      if (upload.storageStatus === "pending") {
        setStatus("0G Storage indexer is unreachable, anchoring a pending content proof on-chain...");
      }

      setStatus("Anchoring memory proof on 0G Chain...");
      const { contract } = await getContract();
      const tx = await contract.anchorMemory(
        BigInt(agentId),
        memoryType,
        upload.rootHash,
        upload.txHash,
        upload.contentHash
      );
      setLastTxHash(tx.hash);
      await tx.wait();
      setStatus(
        upload.storageStatus === "uploaded"
          ? `Memory anchored for agent #${agentId}.`
          : `Memory proof anchored for agent #${agentId}. Storage upload is pending until the indexer is reachable.`
      );
      await loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Memory anchoring failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadAgents() {
    setBusy(true);
    setError("");

    try {
      const { contract, address } = await getContract();
      const ids: bigint[] = await contract.getOwnerAgents(address);
      const views = await Promise.all(
        ids.map(async (id) => {
          const agent = await contract.getAgent(id);
          return {
            id: agent.id.toString(),
            owner: agent.owner,
            name: agent.name,
            description: agent.description,
            metadataRootHash: agent.metadataRootHash,
            memoryCount: agent.memoryCount.toString(),
            active: agent.active
          };
        })
      );
      setAgents(views);
      setStatus(`Loaded ${views.length} owned agent${views.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load agents.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyProof() {
    setBusy(true);
    setError("");
    setStatus("Downloading from 0G Storage with proof verification...");

    try {
      const response = await fetch("/api/proof/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rootHash: verifyRootHash,
          expectedContentHash: verifyContentHash || undefined
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Proof verification failed.");
      setVerification(result);
      setStatus(result.verified ? "Proof verified." : "Proof downloaded but content hash does not match.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proof verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreRealStorageUpload() {
    if (!lastUpload) return;

    setBusy(true);
    setError("");
    setStatus("Retrying real 0G Storage upload for the pending artifact...");

    try {
      const response = await fetch("/api/memory/restore-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: lastUpload.payload })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "0G Storage restore upload is still unavailable.");
      }

      const restored = result as UploadResponse;
      setLastUpload(restored);
      setVerifyRootHash(restored.rootHash);
      setVerifyContentHash(restored.contentHash);
      setStatus("Real 0G Storage upload restored for the latest artifact.");
    } catch (err) {
      setStatus("Current on-chain fallback remains active. Real 0G Storage upload is still unavailable.");
      setError(err instanceof Error ? err.message : "0G Storage restore upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-ink/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-3xl items-start gap-4">
            <div className="relative mt-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-white shadow-sm">
              <ShieldCheck className="h-8 w-8 text-tide" />
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-copper text-[10px] font-bold text-white">
                0G
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-normal text-copper">0G APAC Hackathon MVP</p>
              <h1 className="mt-2 text-4xl font-semibold leading-tight text-ink sm:text-5xl">
                Verifiable Agent Memory Vault
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-ink/70">
                Store agent memory and execution logs on 0G Storage, anchor their proof hashes on 0G Chain, and verify
                the artifact from the product UI.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-60"
              onClick={connectWallet}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {account ? shortHash(account) : "Connect"}
            </button>
            {contractReady ? (
              <a
                className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-ink/15 bg-white px-4 text-sm font-semibold text-ink"
                href={contractLink}
                target="_blank"
              >
                <ExternalLink className="h-4 w-4" />
                Contract
              </a>
            ) : null}
          </div>
        </header>

        <div className="rounded-md border border-ink/10 bg-white/80 p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              {busy ? <Loader2 className="h-4 w-4 animate-spin text-tide" /> : <CheckCircle2 className="h-4 w-4 text-moss" />}
              {status}
            </div>
            <div className="text-xs text-ink/60">Chain {ogConfig.chainId} · {ogConfig.chainName}</div>
          </div>
          {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {!contractReady ? (
            <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Deploy the contract and set <code>NEXT_PUBLIC_AGENT_MEMORY_VAULT_ADDRESS</code> before using on-chain
              actions.
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-md border border-ink/10 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <Bot className="h-5 w-5 text-tide" />
              <h2 className="text-lg font-semibold text-ink">Register Agent</h2>
            </div>
            <label className="block text-sm font-medium text-ink/70">Agent name</label>
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-ink/15 px-3"
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
            />
            <label className="mt-4 block text-sm font-medium text-ink/70">Description</label>
            <textarea
              className="focus-ring mt-2 min-h-24 w-full rounded-md border border-ink/15 p-3"
              value={agentDescription}
              onChange={(event) => setAgentDescription(event.target.value)}
            />
            <button
              className="focus-ring mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-tide px-4 text-sm font-semibold text-white disabled:opacity-60"
              onClick={registerAgent}
              disabled={busy}
            >
              <Database className="h-4 w-4" />
              Upload Metadata and Register
            </button>
          </section>

          <section className="rounded-md border border-ink/10 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <Link className="h-5 w-5 text-copper" />
              <h2 className="text-lg font-semibold text-ink">Anchor Memory</h2>
            </div>
            <label className="block text-sm font-medium text-ink/70">Agent ID</label>
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-ink/15 px-3"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            />
            <label className="mt-4 block text-sm font-medium text-ink/70">Memory type</label>
            <select
              className="focus-ring mt-2 h-11 w-full rounded-md border border-ink/15 px-3"
              value={memoryType}
              onChange={(event) => setMemoryType(event.target.value)}
            >
              <option value="research-note">Research note</option>
              <option value="execution-log">Execution log</option>
              <option value="user-preference">User preference</option>
              <option value="system-instruction">System instruction</option>
            </select>
            <label className="mt-4 block text-sm font-medium text-ink/70">Memory or log content</label>
            <textarea
              className="focus-ring mt-2 min-h-32 w-full rounded-md border border-ink/15 p-3"
              value={memoryContent}
              onChange={(event) => setMemoryContent(event.target.value)}
            />
            <button
              className="focus-ring mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-copper px-4 text-sm font-semibold text-white disabled:opacity-60"
              onClick={anchorMemory}
              disabled={busy}
            >
              <FileCheck2 className="h-4 w-4" />
              Upload and Anchor
            </button>
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-md border border-ink/10 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">Owned Agents</h2>
              <button
                className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink/15 px-3 text-sm font-semibold disabled:opacity-60"
                onClick={loadAgents}
                disabled={busy || !account}
              >
                <Database className="h-4 w-4" />
                Load
              </button>
            </div>
            <div className="space-y-3">
              {agents.length === 0 ? (
                <p className="text-sm text-ink/60">No agents loaded yet.</p>
              ) : (
                agents.map((agent) => (
                  <button
                    key={agent.id}
                    className="focus-ring block w-full rounded-md border border-ink/10 p-4 text-left hover:border-tide/50"
                    onClick={() => {
                      setAgentId(agent.id);
                      setVerifyRootHash(agent.metadataRootHash);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-ink">#{agent.id} {agent.name}</span>
                      <span className="text-xs text-ink/60">{agent.memoryCount} memories</span>
                    </div>
                    <p className="mt-2 text-sm text-ink/65">{agent.description}</p>
                    <p className="mt-2 text-xs text-ink/50">{shortHash(agent.metadataRootHash)}</p>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-md border border-ink/10 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <FileCheck2 className="h-5 w-5 text-moss" />
              <h2 className="text-lg font-semibold text-ink">Proof Verification</h2>
            </div>
            <label className="block text-sm font-medium text-ink/70">0G Storage root hash</label>
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-ink/15 px-3"
              value={verifyRootHash}
              onChange={(event) => setVerifyRootHash(event.target.value)}
            />
            <label className="mt-4 block text-sm font-medium text-ink/70">Expected content hash</label>
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-ink/15 px-3"
              value={verifyContentHash}
              onChange={(event) => setVerifyContentHash(event.target.value)}
            />
            <button
              className="focus-ring mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-moss px-4 text-sm font-semibold text-white disabled:opacity-60"
              onClick={verifyProof}
              disabled={busy || !verifyRootHash}
            >
              <CheckCircle2 className="h-4 w-4" />
              Verify from 0G
            </button>

            {verification ? (
              <div className="mt-5 rounded-md border border-ink/10 bg-cloud p-4">
                <p className="font-semibold text-ink">
                  {verification.verified ? "Verified" : "Hash mismatch"}
                </p>
                <p className="mt-2 text-sm text-ink/70">Content hash: {shortHash(verification.contentHash)}</p>
                <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-ink p-3 text-xs text-white">
                  {JSON.stringify(verification.payload, null, 2)}
                </pre>
              </div>
            ) : null}
          </section>
        </div>

        {lastUpload ? (
          <section className="rounded-md border border-ink/10 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Latest Proof Artifact</h2>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <p><span className="font-semibold">Root:</span> {lastUpload.rootHash}</p>
              <p><span className="font-semibold">Content hash:</span> {lastUpload.contentHash}</p>
              <p><span className="font-semibold">Storage tx:</span> {lastUpload.txHash}</p>
              <p><span className="font-semibold">Bytes:</span> {lastUpload.bytes}</p>
              <p>
                <span className="font-semibold">Storage status:</span>{" "}
                {lastUpload.storageStatus === "uploaded" ? "Uploaded to 0G Storage" : "Pending indexer upload"}
              </p>
              {lastUpload.storageError ? (
                <p className="text-amber-800"><span className="font-semibold">Storage note:</span> {lastUpload.storageError}</p>
              ) : null}
              {lastUpload.storageStatus === "pending" ? (
                <button
                  className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 disabled:opacity-60"
                  onClick={restoreRealStorageUpload}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  Retry real 0G upload
                </button>
              ) : null}
              {lastTxHash ? (
                <a className="inline-flex items-center gap-2 font-semibold text-tide" href={explorerTxUrl(lastTxHash)} target="_blank">
                  <ExternalLink className="h-4 w-4" />
                  View latest chain transaction
                </a>
              ) : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
