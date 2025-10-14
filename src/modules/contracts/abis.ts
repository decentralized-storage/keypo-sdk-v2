/**
 * Smart contract ABIs for the Synapse Storage SDK
 */

export const PermissionsRegistryAbi = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "fileIdentifier",
        type: "string",
      },
      {
        internalType: "address",
        name: "requestAddress",
        type: "address",
      },
    ],
    name: "checkPermission",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "dataIdentifier",
        type: "string",
      },
    ],
    name: "fileIdentifierToFileContract",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "dataIdentifier",
        type: "string",
      },
      {
        internalType: "string",
        name: "metaData",
        type: "string",
      },
      {
        components: [
          {
            internalType: "uint8",
            name: "permissionType",
            type: "uint8",
          },
          {
            internalType: "address",
            name: "permissionAddress",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "tokenQuantity",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "timeLimitBlockNumber",
            type: "uint256",
          },
          {
            internalType: "uint8",
            name: "operator",
            type: "uint8",
          },
        ],
        internalType: "struct PermissionedFileLogic.PermissionParameters[]",
        name: "params",
        type: "tuple[]",
      },
      {
        internalType: "address",
        name: "fileOwner",
        type: "address",
      },
      {
        internalType: "address",
        name: "validationContract",
        type: "address",
      },
    ],
    name: "deployPermissionedFile",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "dataIdentifier",
        type: "string",
      },
      {
        internalType: "uint256",
        name: "quantity",
        type: "uint256",
      },
    ],
    name: "mintFileNFT",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "dataIdentifier",
        type: "string",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "quantity",
        type: "uint256",
      },
    ],
    name: "shareFileWithUser",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "dataIdentifier",
        type: "string",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "revokePermission",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  }
];

export const PermissionedFileAbi = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "quantity",
        type: "uint256",
      },
    ],
    name: "mintNFT",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "revokeUser",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "makePublic",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "makePrivate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  }
];