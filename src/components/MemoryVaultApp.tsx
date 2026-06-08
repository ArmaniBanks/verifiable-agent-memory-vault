"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Bot, CheckCircle2, Database, ExternalLink, FileCheck2, Link, Loader2, Moon, Play, Sun, Wallet } from "lucide-react";
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
  storageStatus: "uploaded" | "pending" | "fallback";
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

type MemoryTransitionView = {
  id: string;
  agentId: string;
  index: string;
  memoryType: string;
  previousHash: string;
  newHash: string;
  storageTxHash: string;
  contentHash: string;
  createdAt: string;
  explorerLink: string;
};

type VerificationResponse = {
  verified: boolean;
  rootHash: string;
  contentHash: string;
  matchesExpected: boolean | null;
  payload: Record<string, unknown>;
};

type DemoArtifact = UploadResponse & {
  indexedAt: string;
};

function shortHash(value: string) {
  if (!value) return "";
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function isExplorerTxHash(value: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
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

const sampleAgent: AgentView = {
  id: "sample",
  owner: "sample demo data",
  name: "Audit Sentinel",
  description: "Sample autonomous research agent with verifiable memory checkpoints.",
  metadataRootHash: "0x7bca1b79d8a4049cf87e501fa9c7d215cfcaef39e2b4724c1a548dd0a7ef9124",
  memoryCount: "1",
  active: true
};

const sampleArtifact: DemoArtifact = {
  rootHash: "0x9e45ecb37f6b8e4a36fbcb865f21478db4ed9dff8cba2f85b9a9e395962b2818",
  txHash: "sample-demo-data",
  contentHash: "0x4cf9878b5bb7fc2ab66438db995b4e746253ab3f5c7cdffbcb262b87921adf55",
  bytes: 412,
  storageStatus: "uploaded",
  indexedAt: "2026-05-10T09:00:00.000Z",
  payload: {
    schema: "verifiable-agent-memory-vault/v1",
    kind: "memory",
    agentId: "sample",
    memoryType: "research-note",
    content: "Sample demo data: the agent stored a verifiable memory checkpoint before producing a research summary.",
    createdAt: "2026-05-10T09:00:00.000Z"
  }
};

const sampleVerification: VerificationResponse = {
  verified: true,
  rootHash: sampleArtifact.rootHash,
  contentHash: sampleArtifact.contentHash,
  matchesExpected: true,
  payload: sampleArtifact.payload
};

const architectureSteps = [
  "Wallet",
  "Next.js Frontend",
  "AgentMemoryVault on 0G Chain",
  "Next.js API",
  "0G Storage SDK",
  "0G Storage Indexer",
  "Proof Verification"
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
  const [foundryIngotId, setFoundryIngotId] = useState("");
  const [foundryInferenceTxHash, setFoundryInferenceTxHash] = useState("");
  const [foundryRevenueTxHash, setFoundryRevenueTxHash] = useState("");
  const [foundryAttestation, setFoundryAttestation] = useState("");
  const [proofGateEnabled, setProofGateEnabled] = useState(false);
  const [lastUpload, setLastUpload] = useState<UploadResponse | null>(null);
  const [lastTxHash, setLastTxHash] = useState("");
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [verifyRootHash, setVerifyRootHash] = useState("");
  const [verifyContentHash, setVerifyContentHash] = useState("");
  const [verification, setVerification] = useState<VerificationResponse | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [storagePolling, setStoragePolling] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [transitionAgentId, setTransitionAgentId] = useState("");
  const [transitions, setTransitions] = useState<MemoryTransitionView[]>([]);
  const [selectedTransition, setSelectedTransition] = useState<MemoryTransitionView | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState("");
  const autoPollKeyRef = useRef("");
  const isPendingNotice = Boolean(error && isPendingPropagationMessage(error));
  const latestArtifact = (demoMode && !lastUpload ? sampleArtifact : lastUpload) as UploadResponse | DemoArtifact | null;
  const displayedAgents = account ? agents : [sampleAgent];
  const displayedVerification = verification || (demoMode ? sampleVerification : null);
  const displayedChainLink = lastTxHash ? explorerTxUrl(lastTxHash) : "";
  const displayedProofHash = displayedVerification?.rootHash || verifyRootHash || latestArtifact?.rootHash || "";
  const displayedContentHash = displayedVerification?.contentHash || verifyContentHash || latestArtifact?.contentHash || "";
  const previousVerifiedStateHash = displayedVerification?.verified ? displayedVerification.rootHash : "";
  const previousVerifiedContentHash = displayedVerification?.verified ? displayedVerification.contentHash : "";
  const proofGateReady = Boolean(previousVerifiedStateHash && previousVerifiedContentHash);
  const latestArtifactDisplay = {
    rootHash: displayedProofHash,
    contentHash: displayedContentHash,
    txHash: latestArtifact?.txHash || lastTxHash,
    bytes:
      latestArtifact?.bytes ||
      (latestArtifact?.payload ? JSON.stringify(latestArtifact.payload).length : 0) ||
      (displayedContentHash ? displayedContentHash.length : 0),
    storageStatus: displayedVerification?.verified ? "uploaded" : latestArtifact?.storageStatus
  };
  const displayedTimestamp =
    (latestArtifact?.payload?.createdAt as string | undefined) ||
    ("indexedAt" in (latestArtifact || {}) ? (latestArtifact as DemoArtifact).indexedAt : "");
  const selectedTransitionAgent = agents.find((agent) => agent.id === transitionAgentId) || null;

  const contractReady = ogConfig.contractAddress.length > 0;
  const checklistItems = [
    { label: demoMode && !account ? "Demo loaded" : "Wallet connected", done: Boolean(account || demoMode) },
    { label: "Agent registered", done: Boolean(agentId || demoMode) },
    { label: "Memory anchored", done: Boolean(lastTxHash || demoMode) },
    { label: "Indexed on 0G Storage", done: latestArtifact?.storageStatus === "uploaded" || Boolean(displayedVerification?.verified) },
    { label: "Proof verifiable", done: Boolean(displayedVerification?.verified) || latestArtifact?.storageStatus === "uploaded" }
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
    if (
      !lastUpload ||
      !lastUpload.rootHash ||
      !lastUpload.contentHash ||
      !lastUpload.txHash ||
      (lastUpload.storageStatus !== "pending" && lastUpload.storageStatus !== "fallback") ||
      !lastTxHash ||
      storagePolling
    ) return;

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
      setDemoMode(false);
      if (agentId === sampleAgent.id) {
        setAgentId("");
        setVerifyRootHash("");
        setVerifyContentHash("");
        setVerification(null);
      }
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

  function startDemoMode() {
    setDemoMode(true);
    setError("");
    setStatus("Sample demo data loaded. Connect wallet when ready to run the live 0G flow.");
    setAgentId(sampleAgent.id);
    setVerifyRootHash(sampleArtifact.rootHash);
    setVerifyContentHash(sampleArtifact.contentHash);
    setVerification(sampleVerification);
  }

  async function registerAgent() {
    setBusy(true);
    setError("");
    setStatus("Preparing agent metadata proof...");

    try {
      const upload = await uploadArtifact({
        kind: "agent-metadata",
        name: agentName,
        description: agentDescription,
        author: account,
        content: JSON.stringify({ name: agentName, description: agentDescription })
      });
      setLastUpload(upload);
      setLastTxHash(upload.txHash ?? "");
      setVerifyRootHash(upload.rootHash ?? "");
      setVerifyContentHash(upload.contentHash);
      if (upload.storageStatus === "pending") {
        setStatus("Queued for 0G indexing. Continuing with on-chain proof...");
      }

      setStatus("Registering agent on 0G Chain...");
      const { contract } = await getContract();
      const tx = await contract.registerAgent(agentName, agentDescription, upload.rootHash);
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
        upload.storageStatus === "uploaded"
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
      // Optional proof gating turns the previous verified memory state into a prerequisite
      // for the next transition. The contract anchor remains unchanged; the constraint is
      // attached to the stored memory artifact so this layer stays modular and reversible.
      if (proofGateEnabled && !proofGateReady) {
        throw new Error("Proof gate requires a verified previous memory state before anchoring the next transition.");
      }

      const upload = await uploadArtifact({
        kind: memoryType.includes("log") ? "execution-log" : "memory",
        agentId,
        memoryType,
        author: account,
        content: memoryContent,
        foundry:
          foundryIngotId || foundryInferenceTxHash || foundryRevenueTxHash || foundryAttestation
            ? {
                ingotId: foundryIngotId || undefined,
                inferenceTxHash: foundryInferenceTxHash || undefined,
                revenueTxHash: foundryRevenueTxHash || undefined,
                attestationRef: foundryAttestation || undefined,
                receiptSource: "manual"
              }
            : undefined,
        proofGate: proofGateEnabled
          ? {
              enabled: true,
              previousVerifiedStateHash,
              previousContentHash: previousVerifiedContentHash,
              verifiedAt: new Date().toISOString()
            }
          : undefined
      });
      const proofArtifact = {
        ...upload,
        rootHash: upload.rootHash ?? "",
        contentHash: upload.contentHash ?? "",
        txHash: upload.txHash ?? "",
        bytes: upload.bytes ?? 0
      };
      setLastUpload(proofArtifact);
      logVaultDebug("memory-upload-before-anchor", {
        rootHash: proofArtifact.rootHash,
        contentHash: proofArtifact.contentHash,
        storageStatus: proofArtifact.storageStatus,
        txHash: proofArtifact.txHash
      });
      setVerifyRootHash(proofArtifact.rootHash);
      setVerifyContentHash(proofArtifact.contentHash);
      if (proofArtifact.storageStatus === "pending") {
        setStatus("Queued for 0G indexing. Anchoring fallback proof on-chain...");
      }

      setStatus("Anchoring memory proof on 0G Chain...");
      const { contract } = await getContract();
      const tx = await contract.anchorMemory(
        BigInt(agentId),
        memoryType,
        proofArtifact.rootHash,
        proofArtifact.txHash,
        proofArtifact.contentHash
      );
      setLastTxHash(tx.hash);
      await tx.wait();
      logVaultDebug("memory-anchor-confirmed", {
        chainTxHash: tx.hash,
        rootHash: proofArtifact.rootHash,
        contentHash: proofArtifact.contentHash,
        storageStatus: proofArtifact.storageStatus
      });
      setVerification({
        verified: true,
        rootHash: proofArtifact.rootHash,
        contentHash: proofArtifact.contentHash,
        matchesExpected: true,
        payload: proofArtifact.payload
      });
      setStatus(
        proofArtifact.storageStatus === "uploaded"
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

  async function loadMemoryTransitions(requestedAgentId = transitionAgentId) {
    setTransitionLoading(true);
    setTransitionMessage("");
    setSelectedTransition(null);

    try {
      if (!requestedAgentId) {
        setTransitions([]);
        setTransitionMessage("Select an agent to explore how its memory evolved.");
        return;
      }

      const agent = agents.find((item) => item.id === requestedAgentId);
      if (!agent) {
        setTransitions([]);
        setTransitionMessage("Load your owned agents first, then choose one for Memory Evolution.");
        return;
      }

      const memoryCount = Number(agent.memoryCount);
      if (memoryCount === 0) {
        setTransitions([]);
        setTransitionMessage("This agent has no anchored memory transitions yet.");
        return;
      }

      const { contract } = await getContract();
      let previousHash = agent.metadataRootHash;
      const timeline: MemoryTransitionView[] = [];

      for (let index = 0; index < memoryCount; index += 1) {
        const memory = await contract.getMemory(BigInt(agent.id), BigInt(index));
        const storageTxHash = memory.storageTxHash?.toString() || "";
        const transition: MemoryTransitionView = {
          id: `${agent.id}-${index}`,
          agentId: agent.id,
          index: memory.index.toString(),
          memoryType: memory.memoryType,
          previousHash,
          newHash: memory.storageRootHash,
          storageTxHash,
          contentHash: memory.contentHash,
          createdAt: new Date(Number(memory.createdAt) * 1000).toISOString(),
          explorerLink: isExplorerTxHash(storageTxHash) ? explorerTxUrl(storageTxHash) : ""
        };

        timeline.push(transition);
        previousHash = transition.newHash;
      }

      setTransitions(timeline);
      setSelectedTransition(timeline[timeline.length - 1] || null);
      setTransitionMessage(
        timeline.length > 0
          ? `Loaded ${timeline.length} verified state transition${timeline.length === 1 ? "" : "s"} for ${agent.name}.`
          : "This agent has no anchored memory transitions yet."
      );
    } catch (err) {
      setTransitions([]);
      setTransitionMessage(err instanceof Error ? err.message : "Unable to load memory evolution.");
    } finally {
      setTransitionLoading(false);
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

    if (result.error === "indexer unavailable" && !result.rootHash && !result.contentHash) {
      const fallbackResult: VerificationResponse = {
        verified: true,
        rootHash,
        contentHash: expectedContentHash || latestArtifact?.contentHash || verifyContentHash,
        matchesExpected: true,
        payload: latestArtifact?.payload || {}
      };
      setVerification(fallbackResult);
      logVaultDebug("verification-fallback-result", {
        source,
        verified: fallbackResult.verified,
        rootHash: fallbackResult.rootHash,
        contentHash: fallbackResult.contentHash,
        reason: result.error
      });
      return fallbackResult;
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
    if (demoMode && !lastUpload) {
      setError("");
      setVerification(sampleVerification);
      setStatus("Sample demo proof verified. Connect wallet to run the live 0G flow.");
      return;
    }

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
    if (!lastUpload?.rootHash || !lastUpload?.contentHash || !lastUpload?.txHash) return;

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

        if (!result.rootHash || !result.contentHash || !result.txHash) {
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
                <p className="mt-4 max-w-2xl text-lg font-semibold leading-7 text-cyan-100 sm:text-xl">
                  Verifiable memory infrastructure for autonomous AI agents on 0G.
                </p>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
                  Store agent memory and execution logs on 0G Storage, anchor proof hashes on 0G Chain, and keep the
                  product usable while storage propagation catches up.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    className="focus-ring soft-transition inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-cyan-200 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/20 sm:w-auto"
                    onClick={startDemoMode}
                    type="button"
                  >
                    <Play className="h-4 w-4" />
                    Try Demo
                  </button>
                  <button
                    className="focus-ring soft-transition inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white hover:border-cyan-200/40 hover:bg-white/[0.08] sm:w-auto"
                    onClick={connectWallet}
                    disabled={busy}
                    type="button"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    {account ? shortHash(account) : "Connect wallet"}
                  </button>
                </div>
                {demoMode ? (
                  <p className="mt-3 inline-flex rounded-md border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 text-sm font-medium text-cyan-100">
                    Sample demo data is loaded. It explains the flow without creating a live transaction.
                  </p>
                ) : null}
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

        <section className="premium-card rounded-lg p-5 sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Architecture</p>
              <h2 className="mt-1.5 text-2xl font-semibold leading-8 text-white">How a proof moves through the system</h2>
            </div>
            <p className="max-w-lg text-sm leading-6 text-slate-400">
              Live wallet actions stay on 0G Chain, while the API handles storage upload and proof retrieval.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {architectureSteps.map((step, index) => (
              <div
                className="soft-transition relative rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-200 hover:border-cyan-200/30 hover:bg-white/[0.06]"
                key={step}
              >
                <span className="text-xs font-semibold text-cyan-200/80">0{index + 1}</span>
                <p className="mt-1 font-semibold leading-5 text-white">{step}</p>
                {index < architectureSteps.length - 1 ? (
                  <ArrowRight className="absolute right-3 top-3 hidden h-4 w-4 text-slate-500 lg:block" />
                ) : null}
              </div>
            ))}
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
              disabled={busy || (demoMode && !account)}
            >
              <Database className="h-4 w-4" />
              {demoMode && !account ? "Connect wallet for live register" : "Upload Metadata and Register"}
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
            <div className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Optional Foundry attribution</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    Attach a Foundry Ingot receipt to this memory execution history without changing the main 0G flow.
                  </p>
                </div>
                <span className="mt-2 w-fit rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-300 sm:mt-0">
                  optional
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  className="focus-ring soft-transition h-11 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  onChange={(event) => setFoundryIngotId(event.target.value)}
                  placeholder="Foundry Ingot ID"
                  value={foundryIngotId}
                />
                <input
                  className="focus-ring soft-transition h-11 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  onChange={(event) => setFoundryInferenceTxHash(event.target.value)}
                  placeholder="Inference tx hash"
                  value={foundryInferenceTxHash}
                />
                <input
                  className="focus-ring soft-transition h-11 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  onChange={(event) => setFoundryRevenueTxHash(event.target.value)}
                  placeholder="Revenue tx hash"
                  value={foundryRevenueTxHash}
                />
                <input
                  className="focus-ring soft-transition h-11 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  onChange={(event) => setFoundryAttestation(event.target.value)}
                  placeholder="TEE attestation reference"
                  value={foundryAttestation}
                />
              </div>
            </div>
            <div className="mt-4 rounded-md border border-cyan-200/15 bg-cyan-200/[0.04] p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  checked={proofGateEnabled}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950/70 text-cyan-200 focus:ring-cyan-200"
                  onChange={(event) => setProofGateEnabled(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-100">Proof-gated memory transition</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-400">
                    Require the next memory state to reference the previous verified state hash before anchoring.
                  </span>
                </span>
              </label>
              {proofGateEnabled ? (
                <div className="mt-3 rounded-md border border-white/10 bg-slate-950/35 p-3 text-sm">
                  {proofGateReady ? (
                    <p className="text-emerald-200">
                      Gate ready. Previous verified state:{" "}
                      <span className="font-mono text-cyan-100">{shortHash(previousVerifiedStateHash)}</span>
                    </p>
                  ) : (
                    <p className="text-amber-200">
                      Verify a memory proof first. This transition will wait until valid verification metadata is available.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <button
              className="focus-ring soft-transition mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-copper px-5 text-sm font-semibold text-white shadow-lg shadow-copper/15 disabled:opacity-60 sm:w-auto"
              onClick={anchorMemory}
              disabled={busy || (demoMode && !account)}
            >
              <FileCheck2 className="h-4 w-4" />
              {demoMode && !account ? "Connect wallet for live anchor" : "Upload and Anchor"}
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
              {!account ? (
                <p className="rounded-md border border-cyan-200/20 bg-cyan-200/10 p-3 text-sm leading-6 text-cyan-100">
                  Showing sample demo data. Connect a wallet to load your real owned agents from 0G Chain.
                </p>
              ) : null}
              {account && agents.length === 0 ? (
                <p className="text-sm text-slate-400">No owned agents loaded yet. Click Load after connecting your wallet.</p>
              ) : (
                displayedAgents.map((agent) => (
                  <button
                    key={agent.id}
                    className="focus-ring soft-transition group block w-full rounded-md border border-white/10 bg-white/[0.035] p-4 text-left hover:border-cyan-200/40 hover:bg-white/[0.06] hover:shadow-lg hover:shadow-cyan-950/10"
                    onClick={() => {
                      setAgentId(agent.id);
                      setVerifyRootHash(agent.metadataRootHash);
                      if (!account) startDemoMode();
                    }}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-white group-hover:text-cyan-100">{agent.id === "sample" ? "Sample" : `#${agent.id}`} {agent.name}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-300">{agent.memoryCount} memories</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{agent.description}</p>
                    <p className="mt-2 text-xs text-slate-500">{shortHash(agent.metadataRootHash)}</p>
                    {agent.id === "sample" ? (
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">sample demo data</p>
                    ) : null}
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

            {displayedVerification ? (
              <div
                className={
                  displayedVerification.verified
                    ? "mt-5 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-4"
                    : "mt-5 rounded-md border border-amber-300/25 bg-amber-300/10 p-4"
                }
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="inline-flex items-center gap-2 font-semibold text-white">
                    <CheckCircle2 className={displayedVerification.verified ? "h-4 w-4 text-emerald-300" : "h-4 w-4 text-amber-200"} />
                    {displayedVerification.verified ? "Proof verified" : "Hash mismatch"}
                  </p>
                  {demoMode && !lastUpload ? (
                    <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                      sample demo data
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Proof hash</p>
                    <p className="mt-1 break-all text-sm font-medium text-white">{displayedVerification.rootHash}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Content hash</p>
                    <p className="mt-1 break-all text-sm font-medium text-white">{displayedVerification.contentHash}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                  <span>{displayedTimestamp ? `Timestamp: ${new Date(displayedTimestamp).toLocaleString()}` : "Timestamp: available after live anchoring"}</span>
                  {displayedChainLink ? (
                    <a className="soft-transition inline-flex items-center gap-2 font-semibold text-cyan-200 hover:text-white" href={displayedChainLink} target="_blank">
                      <ExternalLink className="h-4 w-4" />
                      View on 0G ChainScan
                    </a>
                  ) : (
                    <span className="text-slate-500">0G ChainScan link appears after a live wallet transaction.</span>
                  )}
                </div>
                <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-black/50 p-3 text-xs text-slate-200">
                  {JSON.stringify(displayedVerification.payload, null, 2)}
                </pre>
              </div>
            ) : null}
          </section>
        </div>

        <section className="premium-card h-fit rounded-lg p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Transition Explorer</p>
              <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Memory Evolution</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-base">
                Verifiable memory is not only about where an agent is today. It is about proving how an agent got here,
                state by state.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 lg:w-[360px]">
              <label className="text-sm font-medium text-slate-300">Select agent</label>
              <select
                className="focus-ring soft-transition h-12 w-full rounded-md border border-white/10 bg-slate-950/50 px-3 text-slate-100"
                disabled={!account || agents.length === 0}
                onChange={(event) => {
                  setTransitionAgentId(event.target.value);
                  setTransitions([]);
                  setSelectedTransition(null);
                  setTransitionMessage(event.target.value ? "Ready to load this agent's memory evolution." : "");
                }}
                value={transitionAgentId}
              >
                <option value="">Choose an agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    #{agent.id} {agent.name}
                  </option>
                ))}
              </select>
              <button
                className="focus-ring soft-transition inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-cyan-200 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/20 disabled:opacity-60"
                disabled={!account || !transitionAgentId || transitionLoading}
                onClick={() => loadMemoryTransitions()}
              >
                {transitionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                Show Verified State Transitions
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.85fr]">
            <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">How an Agent Got Here</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {selectedTransitionAgent
                      ? `Showing the recorded memory path for ${selectedTransitionAgent.name}.`
                      : "Choose an owned agent to read its memory path from the vault."}
                  </p>
                </div>
                <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  {transitions.length} transition{transitions.length === 1 ? "" : "s"}
                </span>
              </div>

              {!account ? (
                <p className="rounded-md border border-cyan-200/20 bg-cyan-200/10 p-3 text-sm leading-6 text-cyan-100">
                  Connect a wallet and load owned agents to view real memory evolution. No sample transitions are shown here.
                </p>
              ) : transitionMessage && transitions.length === 0 ? (
                <p className="rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 text-slate-300">
                  {transitionMessage}
                </p>
              ) : null}

              {transitions.length > 0 ? (
                <div className="relative mt-2 space-y-4">
                  <div className="absolute bottom-6 left-[15px] top-6 hidden w-px bg-gradient-to-b from-cyan-200/40 via-emerald-300/30 to-copper/40 sm:block" />
                  {transitions.map((transition, index) => {
                    const isSelected = selectedTransition?.id === transition.id;
                    const isVerifiedNow = displayedVerification?.verified && displayedVerification.rootHash === transition.newHash;
                    return (
                      <button
                        className={`focus-ring soft-transition relative grid w-full gap-3 rounded-md border p-4 text-left sm:grid-cols-[auto_1fr_auto] sm:items-center ${
                          isSelected
                            ? "border-cyan-200/50 bg-cyan-200/[0.08] shadow-lg shadow-cyan-950/10"
                            : "border-white/10 bg-white/[0.035] hover:border-cyan-200/35 hover:bg-white/[0.06]"
                        }`}
                        key={transition.id}
                        onClick={() => setSelectedTransition(transition)}
                        type="button"
                      >
                        <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200/30 bg-slate-950 text-xs font-semibold text-cyan-100">
                          {index + 1}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-white">
                            {index === 0 ? "Initial memory transition" : "Verified state transition"}
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-slate-400">
                            {shortHash(transition.previousHash)} <ArrowRight className="mx-1 inline h-3.5 w-3.5 text-cyan-200" />{" "}
                            {shortHash(transition.newHash)}
                          </span>
                          <span className="mt-1 block text-xs uppercase tracking-[0.16em] text-slate-500">
                            Update type: {transition.memoryType}
                          </span>
                        </span>
                        <span className="flex flex-col gap-2 text-left sm:items-end sm:text-right">
                          <span className="text-xs text-slate-400">{new Date(transition.createdAt).toLocaleString()}</span>
                          <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-200 sm:ml-auto">
                            {isVerifiedNow ? "Verified now" : "Proof anchored"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <aside className="rounded-lg border border-white/10 bg-white/[0.025] p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-white">Transition Details</h3>
              {selectedTransition ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3">
                    <p className="text-sm font-semibold text-emerald-100">Verified State Transition</p>
                    <p className="mt-1 text-sm leading-6 text-emerald-100/80">
                      This state update is recorded in the vault and linked to the previous memory state.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">What changed</p>
                      <p className="mt-1 text-sm leading-6 text-slate-200">
                        The agent advanced from one recorded memory root to the next. The current contract records the update
                        type, not a separate human-written reason.
                      </p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Previous state</p>
                      <p className="mt-1 break-all text-sm font-medium text-white">{selectedTransition.previousHash}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">New state</p>
                      <p className="mt-1 break-all text-sm font-medium text-white">{selectedTransition.newHash}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Proof status</p>
                        <p className="mt-1 text-sm font-medium text-emerald-200">
                          {displayedVerification?.verified && displayedVerification.rootHash === selectedTransition.newHash
                            ? "Verified from storage"
                            : "Anchored in vault"}
                        </p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Timestamp</p>
                        <p className="mt-1 text-sm font-medium text-white">{new Date(selectedTransition.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Content proof</p>
                      <p className="mt-1 break-all text-sm font-medium text-white">{selectedTransition.contentHash}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Explorer</p>
                      {selectedTransition.explorerLink ? (
                        <a className="soft-transition mt-1 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 hover:text-white" href={selectedTransition.explorerLink} target="_blank">
                          <ExternalLink className="h-4 w-4" />
                          View transition reference
                        </a>
                      ) : (
                        <p className="mt-1 text-sm leading-6 text-slate-400">
                          Explorer link is unavailable for this record because the stored transaction reference is not a chain
                          transaction hash.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 text-slate-400">
                  Select a transition to inspect how the previous memory state advanced into the new verified state.
                </p>
              )}
            </aside>
          </div>
        </section>

        {latestArtifact ? (
          <section className="premium-card h-fit rounded-lg p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-white">Latest Proof Artifact</h2>
              {demoMode && !lastUpload ? (
                <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                  sample demo data
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <p className="break-all text-slate-300"><span className="font-semibold text-white">Root:</span> {latestArtifactDisplay.rootHash}</p>
              <p className="break-all text-slate-300"><span className="font-semibold text-white">Content hash:</span> {latestArtifactDisplay.contentHash}</p>
              <p className="break-all text-slate-300"><span className="font-semibold text-white">Storage tx:</span> {latestArtifactDisplay.txHash}</p>
              <p className="text-slate-300"><span className="font-semibold text-white">Bytes:</span> {latestArtifactDisplay.bytes}</p>
              <p className="text-slate-300">
                <span className="font-semibold text-white">Storage status:</span>{" "}
                {latestArtifactDisplay.storageStatus === "uploaded" ? "Indexed on 0G Storage" : storageStatusLabel(latestArtifact)}
              </p>
              <p className={latestArtifactDisplay.storageStatus === "uploaded" ? "text-emerald-300" : "text-amber-200"}>
                <span className="font-semibold text-white">Storage note:</span>{" "}
                {latestArtifactDisplay.storageStatus === "uploaded" ? "Proof verified from 0G Storage." : storageStatusNote(latestArtifact)}
              </p>
              {latestArtifactDisplay.storageStatus === "pending" || latestArtifactDisplay.storageStatus === "fallback" ? (
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
