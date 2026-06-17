import { NextResponse } from "next/server";
import { createPrivateComputerChatCompletion } from "@/src/lib/privateComputer";

export const runtime = "nodejs";

type GenerateRequest = {
  prompt: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequest;

    if (!body.prompt || body.prompt.trim().length < 3) {
      return NextResponse.json({ error: "Prompt must be at least 3 characters." }, { status: 400 });
    }

    const result = await createPrivateComputerChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "You produce concise agent memory entries for Verifiable Agent Memory Vault. Return only the memory content to anchor."
        },
        {
          role: "user",
          content: body.prompt
        }
      ],
      stream: false
    });

    console.info("[VAMV debug] private-computer-minimax-result", {
      model: result.receipt.model,
      responseId: result.receipt.responseId,
      teeVerified: result.receipt.teeVerified,
      providerAddress: result.receipt.providerAddress,
      outputHash: result.receipt.outputHash,
      latencyMs: result.receipt.latencyMs
    });

    return NextResponse.json({
      content: result.output,
      inferenceReceipt: result.receipt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MiniMax-M3 request failed.";
    console.info("[VAMV debug] private-computer-minimax-error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
