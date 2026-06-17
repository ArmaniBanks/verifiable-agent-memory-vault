import { createHash } from "crypto";

export const privateComputerConfig = {
  routerUrl: process.env.OG_PRIVATE_COMPUTER_ROUTER_URL || "https://router-api.0g.ai/v1",
  model: process.env.OG_PRIVATE_COMPUTER_MODEL || "minimax-m3",
  apiKey: process.env.OG_PRIVATE_COMPUTER_API_KEY || "",
  verifyTee: process.env.OG_PRIVATE_COMPUTER_VERIFY_TEE === "true"
};

export type PrivateComputerMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type PrivateComputerChatOptions = {
  messages: PrivateComputerMessage[];
  stream?: boolean;
};

export type PrivateComputerInferenceReceipt = {
  model: string;
  provider: "0G Private Computer";
  routerUrl: string;
  responseId?: string;
  providerAddress?: string;
  teeVerified?: boolean;
  verifyTee: boolean;
  latencyMs: number;
  tokenUsage?: Record<string, unknown>;
  outputHash: string;
  createdAt: string;
};

function sha256Hex(input: string) {
  return `0x${createHash("sha256").update(input).digest("hex")}`;
}

export async function createPrivateComputerChatCompletion(options: PrivateComputerChatOptions) {
  if (!privateComputerConfig.apiKey) {
    throw new Error("OG_PRIVATE_COMPUTER_API_KEY is required to call 0G Private Computer.");
  }

  const started = Date.now();
  const routerUrl = privateComputerConfig.routerUrl.replace(/\/$/, "");
  const response = await fetch(`${routerUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${privateComputerConfig.apiKey}`
    },
    body: JSON.stringify({
      model: privateComputerConfig.model,
      messages: options.messages,
      stream: options.stream ?? false,
      verify_tee: privateComputerConfig.verifyTee
    })
  });

  const payload = await response.json();
  const latencyMs = Date.now() - started;

  if (!response.ok) {
    throw new Error(payload?.error?.message || "0G Private Computer request failed.");
  }

  const output = payload?.choices?.[0]?.message?.content || "";
  const trace = payload?.x_0g_trace || {};
  const receipt: PrivateComputerInferenceReceipt = {
    model: payload?.model || privateComputerConfig.model,
    provider: "0G Private Computer",
    routerUrl,
    responseId: payload?.id,
    providerAddress: trace?.provider,
    teeVerified: trace?.tee_verified,
    verifyTee: privateComputerConfig.verifyTee,
    latencyMs,
    tokenUsage: payload?.usage,
    outputHash: sha256Hex(output),
    createdAt: new Date().toISOString()
  };

  return { payload, output, receipt };
}
