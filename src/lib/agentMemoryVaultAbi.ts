export const agentMemoryVaultAbi = [
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "metadataRootHash", type: "string" }
    ],
    outputs: [{ name: "agentId", type: "uint256" }]
  },
  {
    type: "function",
    name: "anchorMemory",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "memoryType", type: "string" },
      { name: "storageRootHash", type: "string" },
      { name: "storageTxHash", type: "string" },
      { name: "contentHash", type: "bytes32" }
    ],
    outputs: [{ name: "index", type: "uint256" }]
  },
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "owner", type: "address" },
          { name: "name", type: "string" },
          { name: "description", type: "string" },
          { name: "metadataRootHash", type: "string" },
          { name: "createdAt", type: "uint256" },
          { name: "memoryCount", type: "uint256" },
          { name: "active", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getMemory",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "index", type: "uint256" }
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "agentId", type: "uint256" },
          { name: "index", type: "uint256" },
          { name: "memoryType", type: "string" },
          { name: "storageRootHash", type: "string" },
          { name: "storageTxHash", type: "string" },
          { name: "contentHash", type: "bytes32" },
          { name: "createdAt", type: "uint256" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getOwnerAgents",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }]
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { indexed: true, name: "agentId", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "name", type: "string" },
      { indexed: false, name: "metadataRootHash", type: "string" }
    ]
  },
  {
    type: "event",
    name: "MemoryAnchored",
    inputs: [
      { indexed: true, name: "agentId", type: "uint256" },
      { indexed: true, name: "index", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "memoryType", type: "string" },
      { indexed: false, name: "storageRootHash", type: "string" },
      { indexed: false, name: "storageTxHash", type: "string" },
      { indexed: false, name: "contentHash", type: "bytes32" }
    ]
  }
] as const;

