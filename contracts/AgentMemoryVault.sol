// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentMemoryVault {
    struct Agent {
        uint256 id;
        address owner;
        string name;
        string description;
        string metadataRootHash;
        uint256 createdAt;
        uint256 memoryCount;
        bool active;
    }

    struct MemoryRecord {
        uint256 agentId;
        uint256 index;
        string memoryType;
        string storageRootHash;
        string storageTxHash;
        bytes32 contentHash;
        uint256 createdAt;
    }

    uint256 public nextAgentId = 1;

    mapping(uint256 => Agent) private agents;
    mapping(uint256 => mapping(uint256 => MemoryRecord)) private memories;
    mapping(address => uint256[]) private ownerAgents;

    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        string name,
        string metadataRootHash
    );

    event MemoryAnchored(
        uint256 indexed agentId,
        uint256 indexed index,
        address indexed owner,
        string memoryType,
        string storageRootHash,
        string storageTxHash,
        bytes32 contentHash
    );

    event AgentStatusChanged(uint256 indexed agentId, bool active);

    modifier onlyAgentOwner(uint256 agentId) {
        require(agents[agentId].owner == msg.sender, "Not agent owner");
        _;
    }

    function registerAgent(
        string calldata name,
        string calldata description,
        string calldata metadataRootHash
    ) external returns (uint256 agentId) {
        require(bytes(name).length > 0, "Name required");
        require(bytes(metadataRootHash).length > 0, "Metadata root required");

        agentId = nextAgentId++;
        agents[agentId] = Agent({
            id: agentId,
            owner: msg.sender,
            name: name,
            description: description,
            metadataRootHash: metadataRootHash,
            createdAt: block.timestamp,
            memoryCount: 0,
            active: true
        });

        ownerAgents[msg.sender].push(agentId);

        emit AgentRegistered(agentId, msg.sender, name, metadataRootHash);
    }

    function anchorMemory(
        uint256 agentId,
        string calldata memoryType,
        string calldata storageRootHash,
        string calldata storageTxHash,
        bytes32 contentHash
    ) external onlyAgentOwner(agentId) returns (uint256 index) {
        require(agents[agentId].active, "Agent inactive");
        require(bytes(memoryType).length > 0, "Memory type required");
        require(bytes(storageRootHash).length > 0, "Storage root required");
        require(contentHash != bytes32(0), "Content hash required");

        index = agents[agentId].memoryCount;
        memories[agentId][index] = MemoryRecord({
            agentId: agentId,
            index: index,
            memoryType: memoryType,
            storageRootHash: storageRootHash,
            storageTxHash: storageTxHash,
            contentHash: contentHash,
            createdAt: block.timestamp
        });

        agents[agentId].memoryCount = index + 1;

        emit MemoryAnchored(
            agentId,
            index,
            msg.sender,
            memoryType,
            storageRootHash,
            storageTxHash,
            contentHash
        );
    }

    function setAgentActive(uint256 agentId, bool active) external onlyAgentOwner(agentId) {
        agents[agentId].active = active;
        emit AgentStatusChanged(agentId, active);
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        require(agents[agentId].owner != address(0), "Agent not found");
        return agents[agentId];
    }

    function getMemory(uint256 agentId, uint256 index) external view returns (MemoryRecord memory) {
        require(index < agents[agentId].memoryCount, "Memory not found");
        return memories[agentId][index];
    }

    function getOwnerAgents(address owner) external view returns (uint256[] memory) {
        return ownerAgents[owner];
    }
}

