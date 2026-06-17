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

export async function createPrivateComputerChatCompletion(options: PrivateComputerChatOptions) {
  if (!privateComputerConfig.apiKey) {
    throw new Error("OG_PRIVATE_COMPUTER_API_KEY is required to call 0G Private Computer.");
  }

  const response = await fetch(`${privateComputerConfig.routerUrl}/chat/completions`, {
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

  if (!response.ok) {
    throw new Error(payload?.error?.message || "0G Private Computer request failed.");
  }

  return payload;
}
