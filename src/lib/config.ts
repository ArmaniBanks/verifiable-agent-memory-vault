export const ogConfig = {
  chainId: Number(process.env.NEXT_PUBLIC_0G_CHAIN_ID || 16661),
  chainName: process.env.NEXT_PUBLIC_0G_CHAIN_NAME || "0G Mainnet",
  rpcUrl: process.env.NEXT_PUBLIC_0G_RPC_URL || "https://evmrpc.0g.ai",
  explorerUrl: process.env.NEXT_PUBLIC_0G_EXPLORER_URL || "https://chainscan.0g.ai",
  storageIndexerUrl:
    process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER_URL || "https://indexer-storage-turbo.0g.ai",
  contractAddress: process.env.NEXT_PUBLIC_AGENT_MEMORY_VAULT_ADDRESS || ""
};

export function explorerAddressUrl(address: string) {
  return `${ogConfig.explorerUrl}/address/${address}`;
}

export function explorerTxUrl(txHash: string) {
  return `${ogConfig.explorerUrl}/tx/${txHash}`;
}

