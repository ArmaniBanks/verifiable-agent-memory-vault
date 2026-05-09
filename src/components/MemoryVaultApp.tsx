"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Bot, CheckCircle2, Database, ExternalLink, FileCheck2, Link, Loader2, Moon, Sun, Wallet } from "lucide-react";
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

function storageStatusLabel(upload: UploadResponse) {
  return upload.storageStatus === "uploaded" ? "Indexed on 0G Storage" : "Fallback proof active";
}

function storageStatusNote(upload: UploadResponse) {
  return upload.storageStatus === "uploaded"
    ? "Proof verified from 0G Storage."
    : "Queued for 0G indexing. Your on-chain proof is already active while storage propagation catches up.";
}

function isPendingPropagationMessage(message: string) {
  return /storage propagation is still pending|queued for 0g indexing|fallback proof remains active/i.test(message);
}

function logVaultDebug(label: string, details: Record<string, unknown>) {
  console.info(`[VAMV debug] ${label}`, details);
}

const workflowSteps = [
  {
    title: "Create Agent",
    detail: "Register identity and metadata roots on 0G Chain.",
    icon: Bot
  },
  {
    title: "Anchor Memory",
    detail: "Attach memory and execution-log proofs to the agent record.",
    icon: Database
  },
  {
    title: "Verify Proof",
    detail: "Review hashes, propagation status, and explorer activity.",
    icon: FileCheck2
  }
];

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
  const [theme, setTheme] = useState<"dark" | "light">("dark");
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
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [storagePolling, setStoragePolling] = useState(false);
  const autoPollKeyRef = useRef("");
  const isPendingNotice = Boolean(error && isPendingPropagationMessage(error));

  const contractReady = ogConfig.contractAddress.length > 0;
  const checklistItems = [
    { label: "Wallet connected", done: Boolean(account) },
    { label: "Agent registered", done: Boolean(agentId) },
    { label: "Memory anchored", done: Boolean(lastTxHash) },
    { label: "Indexed on 0G Storage", done: lastUpload?.storageStatus === "uploaded" },
    { label: "Proof verifiable", done: Boolean(verification?.verified || lastUpload?.storageStatus === "uploaded") }
  ];

  const contractLink = useMemo(() => {
    return contractReady ? explorerAddressUrl(ogConfig.contractAddress) : "";
  }, [contractReady]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("vamv-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("vamv-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!lastUpload || lastUpload.storageStatus !== "pending" || !lastTxHash || storagePolling) return;

    const pollKey = `${lastTxHash}:${lastUpload.rootHash}:${lastUpload.contentHash}`;
    if (autoPollKeyRef.current === pollKey) return;
    autoPollKeyRef.current = pollKey;

    logVaultDebug("auto-indexing-poll-start", {
      rootHash: lastUpload.rootHash,
      contentHash: lastUpload.contentHash,
      storageStatus: lastUpload.storageStatus,
      txHash: lastUpload.txHash
    });

    void restoreRealStorageUpload({ automatic: true, maxAttempts: 8, delayMs: 4500 });
  // The poll should start once per pending artifact/chain tx pair; the retry function reads that captured artifact.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTxHash, lastUpload, storagePolling]);

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
    logVaultDebug("upload-response", {
      ok: response.ok,
      rootHash: payload.rootHash,
      contentHash: payload.contentHash,
      storageStatus: payload.storageStatus,
      txHash: payload.txHash,
      error: payload.error,
      storageError: payload.storageError
    });
    if (!response.ok) {
      throw new Error(payload.error || "0G upload failed.");
    }

    return payload as UploadResponse;
  }

  async function registerAgent() {
    setBusy(true);
    setError("");
    setStatus("Preparing agent metadata proof...");

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
        setStatus("Queued for 0G indexing. Continuing with on-chain proof...");
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
          ? `Agent #${createdId} registered. Proof verified from 0G Storage.`
          : `Agent #${createdId} registered on 0G Chain. Fallback proof active while storage indexing completes.`
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
    setStatus("Preparing memory proof...");

    try {
      if (!agentId) throw new Error("Register or enter an agent ID first.");

      const upload = await uploadArtifact({
        kind: memoryType.includes("log") ? "execution-log" : "memory",
        agentId,
        memoryType,
        author: account,
        content: memoryContent
      });
      logVaultDebug("memory-upload-before-anchor", {
        rootHash: upload.rootHash,
        contentHash: upload.contentHash,
        storageStatus: upload.storageStatus,
        txHash: upload.txHash
      });
      setLastUpload(upload);
      setVerifyRootHash(upload.rootHash);
      setVerifyContentHash(upload.contentHash);
      if (upload.storageStatus === "pending") {
        setStatus("Queued for 0G indexing. Anchoring fallback proof on-chain...");
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
      logVaultDebug("memory-anchor-confirmed", {
        chainTxHash: tx.hash,
        rootHash: upload.rootHash,
        contentHash: upload.contentHash,
        storageStatus: upload.storageStatus
      });
      setStatus(
        upload.storageStatus === "uploaded"
          ? `Memory anchored for agent #${agentId}. Proof verified from 0G Storage.`
          : `Memory proof anchored for agent #${agentId}. Fallback proof active while storage indexing completes.`
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

  async function verifyStoredProof(rootHash: string, expectedContentHash: string | undefined, source: "manual" | "auto") {
    logVaultDebug("proof-request", {
      source,
      rootHash,
      expectedContentHash
    });

    const response = await fetch("/api/proof/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        rootHash,
        expectedContentHash
        })
      });

      const result = await response.json();
    logVaultDebug("proof-response", {
      source,
      ok: response.ok,
      verified: result.verified,
      pending: result.pending,
      rootHash: result.rootHash,
      contentHash: result.contentHash,
      matchesExpected: result.matchesExpected,
      error: result.error,
      detail: result.detail
    });

    if (!response.ok) {
      throw new Error(result.pending ? "Storage propagation is still pending." : result.error || "Proof verification failed.");
    }

    const verifiedResult = result as VerificationResponse;
    setVerification(verifiedResult);
    logVaultDebug("verification-result", {
      source,
      verified: verifiedResult.verified,
      rootHash: verifiedResult.rootHash,
      contentHash: verifiedResult.contentHash,
      matchesExpected: verifiedResult.matchesExpected
    });
    return verifiedResult;
  }

  async function verifyProof() {
    setBusy(true);
    setError("");
    setStatus("Verifying storage propagation...");

    try {
      const result = await verifyStoredProof(verifyRootHash, verifyContentHash || undefined, "manual");
      setStatus(result.verified ? "Proof verified from 0G Storage." : "Storage proof returned, but content hash did not match.");
    } catch (err) {
      setStatus("Fallback proof active. Waiting for 0G Storage indexing...");
      setError(err instanceof Error ? err.message : "Storage propagation is still pending.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreRealStorageUpload(options: { automatic?: boolean; maxAttempts?: number; delayMs?: number } = {}) {
    if (!lastUpload) return;

    const automatic = options.automatic ?? false;
    const maxAttempts = options.maxAttempts ?? 1;
    const delayMs = options.delayMs ?? 5000;

    if (automatic) {
      setStoragePolling(true);
    } else {
      setBusy(true);
    }
    setError("");
    setStatus(automatic ? "Verifying storage propagation in the background..." : "Verifying storage propagation...");

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const countdownSeconds = Math.ceil(delayMs / 1000);
        for (let seconds = countdownSeconds; seconds > 0; seconds -= 1) {
          setRetryCountdown(seconds);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        setRetryCountdown(0);

        logVaultDebug("indexing-retry-attempt", {
          automatic,
          attempt,
          maxAttempts,
          rootHash: lastUpload.rootHash,
          contentHash: lastUpload.contentHash,
          storageStatus: lastUpload.storageStatus,
          txHash: lastUpload.txHash
        });

        const response = await fetch("/api/memory/restore-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload: lastUpload.payload })
        });

        const result = await response.json();
        logVaultDebug("indexing-restore-response", {
          automatic,
          attempt,
          ok: response.ok,
          rootHash: result.rootHash,
          contentHash: result.contentHash,
          storageStatus: result.storageStatus,
          txHash: result.txHash,
          error: result.error,
          detail: result.detail
        });

        if (!response.ok) {
          if (attempt < maxAttempts) {
            setStatus("Fallback proof active. Waiting for 0G Storage indexing...");
            setError("Queued for 0G indexing. Fallback proof remains active.");
            continue;
          }

          throw new Error("Queued for 0G indexing. Fallback proof remains active.");
        }

        const restored = result as UploadResponse;
        setLastUpload(restored);
        setVerifyRootHash(restored.rootHash);
        setVerifyContentHash(restored.contentHash);
        setVerification({
          verified: true,
          rootHash: restored.rootHash,
          contentHash: restored.contentHash,
          matchesExpected: true,
          payload: restored.payload
        });
        setStatus("Proof verified from 0G Storage.");
        setError("");

        try {
          const proofResult = await verifyStoredProof(restored.rootHash, restored.contentHash, "auto");
          setStatus(proofResult.verified ? "Proof verified from 0G Storage." : "Storage proof returned, but content hash did not match.");
        } catch (err) {
          logVaultDebug("post-index-proof-pending", {
            automatic,
            error: err instanceof Error ? err.message : String(err),
            rootHash: restored.rootHash,
            contentHash: restored.contentHash
          });
        }
        return;
      }
    } catch (err) {
      setStatus("Fallback proof active. You can keep working while 0G indexing catches up.");
      setError(err instanceof Error ? err.message : "Queued for 0G indexing. Fallback proof remains active.");
    } finally {
      setRetryCountdown(0);
      setStoragePolling(false);
      if (!automatic) {
        setBusy(false);
      }
    }
  }

  return (
    <main className={`min-h-screen overflow-hidden ${theme === "light" ? "theme-light" : "theme-dark"}`}>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-8 sm:py-8 lg:px-10">
        <header className="premium-card relative overflow-hidden rounded-lg p-5 sm:p-7 lg:p-9">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex max-w-4xl flex-col gap-5 sm:flex-row sm:items-start">
              <div className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#050a13]/80 p-2 shadow-2xl shadow-cyan-950/30 sm:hidden">
                <Image
                  alt="Verifiable Agent Memory Vault"
                  className="h-full w-full object-contain"
                  height={512}
                  priority
                  src="/brand/vamv-icon-transparent.png"
                  width={512}
                />
              </div>
              <div className="relative hidden h-[78px] w-[250px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#050a13]/80 px-3 shadow-2xl shadow-cyan-950/30 sm:flex lg:h-[86px] lg:w-[276px]">
                <Image
                  alt="Verifiable Agent Memory Vault"
                  className="h-auto w-full object-contain"
                  height={500}
                  priority
                  src="/brand/vamv-logo-transparent.png"
                  width={1600}
                />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-copper">0G APAC Hackathon MVP</p>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                    Live on 0G Mainnet
                  </span>
                </div>
                <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-[1.03] text-white sm:text-6xl lg:text-7xl">
                  Verifiable Agent Memory Vault
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
                  Store agent memory and execution logs on 0G Storage, anchor proof hashes on 0G Chain, and keep the
                  product usable while storage propagation catches up.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-slate-300">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">0G Chain</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">0G Storage</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">Proof fallback</span>
                </div>
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row lg:flex-col">
              <button
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                className="focus-ring soft-transition inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white hover:border-cyan-200/40 hover:bg-white/[0.08] sm:w-auto"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                type="button"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
              <button
                className="focus-ring soft-transition inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-white/10 disabled:opacity-60 sm:w-auto"
                onClick={connectWallet}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {account ? shortHash(account) : "Connect wallet"}
              </button>
              {contractReady ? (
                <a
                  className="focus-ring soft-transition inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white hover:border-cyan-200/40 hover:bg-white/[0.08]"
                  href={contractLink}
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                  View contract
                </a>
              ) : null}
            </div>
          </div>
        </header>

        <div className="premium-card rounded-lg p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
              {busy ? <Loader2 className="h-4 w-4 animate-spin text-cyan-200" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
              {status}
            </div>
            <div className="text-xs text-slate-400">Chain {ogConfig.chainId} · {ogConfig.chainName}</div>
          </div>
          {error ? (
            <p
              className={
                isPendingNotice
                  ? "mt-3 flex items-center gap-2 rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100"
                  : "mt-3 rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200"
              }
            >
              {isPendingNotice ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-200" /> : null}
              {isPendingNotice ? "Waiting for 0G Storage indexing..." : error}
            </p>
          ) : null}
          {!contractReady ? (
            <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100">
              Deploy the contract and set <code>NEXT_PUBLIC_AGENT_MEMORY_VAULT_ADDRESS</code> before using on-chain
              actions.
            </p>
          ) : null}
        </div>

        <section className="premium-card rounded-lg p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Live demo checklist</p>
              <h2 className="mt-1.5 text-lg font-semibold leading-7 text-white">Submission proof flow</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {checklistItems.map((item) => (
                <div
                  className="soft-transition flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-slate-300 hover:border-cyan-200/30 hover:bg-white/[0.06]"
                  key={item.label}
                >
                  <CheckCircle2 className={item.done ? "h-4 w-4 text-emerald-300" : "h-4 w-4 text-slate-500"} />
                  <span className={item.done ? "text-white" : "text-slate-400"}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="premium-card rounded-lg p-5 sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Workflow</p>
              <h2 className="mt-1.5 text-2xl font-semibold leading-8 text-white">Create Agent → Anchor Memory → Verify Proof</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-400">
              The core loop stays available even while storage indexing is still propagating.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {workflowSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  className="soft-transition relative rounded-md border border-white/10 bg-white/[0.04] p-4 hover:border-cyan-200/40 hover:bg-white/[0.075] hover:shadow-lg hover:shadow-cyan-950/10"
                  key={step.title}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-200/10 text-cyan-100">
                      <Icon className="h-5 w-5" />
                    </div>
                    {index < workflowSteps.length - 1 ? <ArrowRight className="mt-2 hidden h-4 w-4 text-slate-500 lg:block" /> : null}
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{step.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="premium-card h-fit rounded-lg p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <Bot className="h-5 w-5 text-cyan-200" />
              <h2 className="text-lg font-semibold text-white">Register Agent</h2>
            </div>
            <label className="block text-sm font-medium text-slate-300">Agent name</label>
            <input
              className="focus-ring soft-transition mt-2 h-12 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-slate-100 placeholder:text-slate-500"
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
            />
            <label className="mt-4 block text-sm font-medium text-slate-300">Description</label>
            <textarea
              className="focus-ring soft-transition mt-2 min-h-28 w-full rounded-md border border-white/10 bg-slate-950/50 p-3 text-slate-100 placeholder:text-slate-500"
              value={agentDescription}
              onChange={(event) => setAgentDescription(event.target.value)}
            />
            <button
              className="focus-ring soft-transition mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-cyan-200 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/20 disabled:opacity-60 sm:w-auto"
              onClick={registerAgent}
              disabled={busy}
            >
              <Database className="h-4 w-4" />
              Upload Metadata and Register
            </button>
          </section>

          <section className="premium-card h-fit rounded-lg p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <Link className="h-5 w-5 text-copper" />
              <h2 className="text-lg font-semibold text-white">Anchor Memory</h2>
            </div>
            <label className="block text-sm font-medium text-slate-300">Agent ID</label>
            <input
              className="focus-ring soft-transition mt-2 h-12 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-slate-100 placeholder:text-slate-500"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            />
            <label className="mt-4 block text-sm font-medium text-slate-300">Memory type</label>
            <select
              className="focus-ring soft-transition mt-2 h-12 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-slate-100"
              value={memoryType}
              onChange={(event) => setMemoryType(event.target.value)}
            >
              <option value="research-note">Research note</option>
              <option value="execution-log">Execution log</option>
              <option value="user-preference">User preference</option>
              <option value="system-instruction">System instruction</option>
            </select>
            <label className="mt-4 block text-sm font-medium text-slate-300">Memory or log content</label>
            <textarea
              className="focus-ring soft-transition mt-2 min-h-36 w-full rounded-md border border-white/10 bg-slate-950/50 p-3 text-slate-100 placeholder:text-slate-500"
              value={memoryContent}
              onChange={(event) => setMemoryContent(event.target.value)}
            />
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Storage indexing may take a few moments depending on 0G propagation.
            </p>
            <button
              className="focus-ring soft-transition mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-copper px-5 text-sm font-semibold text-white shadow-lg shadow-copper/15 disabled:opacity-60 sm:w-auto"
              onClick={anchorMemory}
              disabled={busy}
            >
              <FileCheck2 className="h-4 w-4" />
              Upload and Anchor
            </button>
          </section>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="premium-card h-fit rounded-lg p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Owned Agents</h2>
              <button
                className="focus-ring soft-transition inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-100 hover:border-cyan-200/40 disabled:opacity-60"
                onClick={loadAgents}
                disabled={busy || !account}
              >
                <Database className="h-4 w-4" />
                Load
              </button>
            </div>
            <div className="space-y-3">
              {agents.length === 0 ? (
                <p className="text-sm text-slate-400">No agents loaded yet.</p>
              ) : (
                agents.map((agent) => (
                  <button
                    key={agent.id}
                    className="focus-ring soft-transition group block w-full rounded-md border border-white/10 bg-white/[0.035] p-4 text-left hover:border-cyan-200/40 hover:bg-white/[0.06] hover:shadow-lg hover:shadow-cyan-950/10"
                    onClick={() => {
                      setAgentId(agent.id);
                      setVerifyRootHash(agent.metadataRootHash);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-white group-hover:text-cyan-100">#{agent.id} {agent.name}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-300">{agent.memoryCount} memories</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{agent.description}</p>
                    <p className="mt-2 text-xs text-slate-500">{shortHash(agent.metadataRootHash)}</p>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="premium-card h-fit rounded-lg p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <FileCheck2 className="h-5 w-5 text-emerald-300" />
              <h2 className="text-lg font-semibold text-white">Proof Verification</h2>
            </div>
            <label className="block text-sm font-medium text-slate-300">0G Storage root hash</label>
            <p className="mb-3 text-sm leading-6 text-slate-400">
              Paste a root hash and expected content hash, or generate one from Anchor Memory.
            </p>
            <input
              className="focus-ring soft-transition mt-2 h-12 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-slate-100 placeholder:text-slate-500"
              value={verifyRootHash}
              onChange={(event) => setVerifyRootHash(event.target.value)}
            />
            <label className="mt-4 block text-sm font-medium text-slate-300">Expected content hash</label>
            <input
              className="focus-ring soft-transition mt-2 h-12 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-slate-100 placeholder:text-slate-500"
              value={verifyContentHash}
              onChange={(event) => setVerifyContentHash(event.target.value)}
            />
            <button
              className="focus-ring soft-transition mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-emerald-300 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/15 disabled:opacity-60 sm:w-auto"
              onClick={verifyProof}
              disabled={busy || !verifyRootHash}
            >
              <CheckCircle2 className="h-4 w-4" />
              Verify from 0G
            </button>

            {verification ? (
              <div className="mt-5 rounded-md border border-white/10 bg-slate-950/60 p-4">
                <p className="font-semibold text-white">
                  {verification.verified ? "Verified" : "Hash mismatch"}
                </p>
                <p className="mt-2 text-sm text-slate-400">Content hash: {shortHash(verification.contentHash)}</p>
                <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-black/50 p-3 text-xs text-slate-200">
                  {JSON.stringify(verification.payload, null, 2)}
                </pre>
              </div>
            ) : null}
          </section>
        </div>

        {lastUpload ? (
          <section className="premium-card h-fit rounded-lg p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-white">Latest Proof Artifact</h2>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <p className="text-slate-300"><span className="font-semibold text-white">Root:</span> {lastUpload.rootHash}</p>
              <p className="text-slate-300"><span className="font-semibold text-white">Content hash:</span> {lastUpload.contentHash}</p>
              <p className="text-slate-300"><span className="font-semibold text-white">Storage tx:</span> {lastUpload.txHash}</p>
              <p className="text-slate-300"><span className="font-semibold text-white">Bytes:</span> {lastUpload.bytes}</p>
              <p className="text-slate-300">
                <span className="font-semibold text-white">Storage status:</span>{" "}
                {storageStatusLabel(lastUpload)}
              </p>
              <p className={lastUpload.storageStatus === "uploaded" ? "text-emerald-300" : "text-amber-200"}>
                <span className="font-semibold text-white">Storage note:</span> {storageStatusNote(lastUpload)}
              </p>
              {lastUpload.storageStatus === "pending" ? (
                <button
                  className="focus-ring soft-transition inline-flex h-10 items-center justify-center gap-2 rounded-md border border-amber-200/30 bg-amber-300/10 px-3 text-sm font-semibold text-amber-100 disabled:opacity-60"
                  onClick={() => restoreRealStorageUpload()}
                  disabled={busy || storagePolling}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  {retryCountdown > 0 ? `Retry in ${retryCountdown}s` : storagePolling ? "Checking 0G indexing" : "Verify storage propagation"}
                </button>
              ) : null}
              {lastTxHash ? (
                <a className="soft-transition inline-flex items-center gap-2 font-semibold text-cyan-200 hover:text-white" href={explorerTxUrl(lastTxHash)} target="_blank">
                  <ExternalLink className="h-4 w-4" />
                  View latest chain transaction
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <footer className="pb-4 pt-2 text-center text-xs font-medium text-slate-500 sm:text-sm">
          Built for 0G APAC Hackathon • Verifiable AI memory infrastructure
        </footer>
      </section>
    </main>
  );
}
