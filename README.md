# Synapse Storage SDK

A TypeScript SDK for encrypted file storage on Filecoin via Synapse, with Lit Protocol encryption and smart contract-based access control.

## Features

- 🔐 **End-to-end encryption** with Lit Protocol v8
- 📁 **Filecoin storage** via Synapse SDK
- 🎫 **NFT-based access control** with smart contracts
- 🌍 **Public/private file modes**
- 💰 **Payment management** for USDFC tokens
- 🔗 **File sharing** with granular permissions
- 🦺 **Type-safe** TypeScript implementation

## Installation

```bash
npm install @keypo/synapse-storage-sdk
```

## Peer Dependencies

This SDK requires you to install the Synapse SDK and related dependencies:

```bash
npm install @filoz/synapse-sdk ethers viem
```

## Quick Start

```typescript
import { Synapse } from '@filoz/synapse-sdk';
import { SynapseStorageSDK } from '@keypo/synapse-storage-sdk';
import { ethers } from 'ethers';

// Initialize Synapse (you control this)
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
const provider = new ethers.JsonRpcProvider('https://api.calibration.node.glif.io/rpc/v1');
const signer = wallet.connect(provider);

const synapse = await Synapse.create({
  signer,
  withCDN: true,
});

// Initialize SDK
const sdk = new SynapseStorageSDK(synapse, {
  network: 'calibration',
  encryption: {
    registryAddress: '0x8370eE1a51B5F31cc10E2f4d786Ff20198B10BBE',
    validationAddress: '0x35ADB6b999AbcD5C9CdF2262c7190C7b96ABcE4C',
    bundlerRpcUrl: 'https://rpc.zerodev.app/api/v3/YOUR_PROJECT_ID/chain/84532'
  },
  storage: {
    capacityGB: 10,
    persistenceDays: 30,
    withCDN: true
  }
}, process.env.PRIVATE_KEY);

// Upload encrypted file
const fileData = new Uint8Array([1, 2, 3, 4, 5]);
const result = await sdk.upload(fileData, {
  fileName: 'example.bin',
  encrypted: true,
  isPublic: true, // Anyone can decrypt
  onProgress: (progress) => console.log(progress.message)
});

console.log('Uploaded:', result.pieceCid);

// Download and decrypt
const downloaded = await sdk.download(result.pieceCid, {
  decrypt: true,
  onProgress: (progress) => console.log(progress.message)
});

console.log('Downloaded:', downloaded.data);
```

## Configuration

### SDKConfig

```typescript
interface SDKConfig {
  network: 'mainnet' | 'calibration';
  rpcUrl?: string;
  
  encryption?: {
    registryAddress: string;      // Permissions registry contract
    validationAddress: string;    // Validation contract  
    bundlerRpcUrl: string;       // Account abstraction bundler
  };
  
  storage?: {
    capacityGB?: number;         // Storage capacity (default: 10)
    persistenceDays?: number;    // Storage duration (default: 30)  
    withCDN?: boolean;          // Enable CDN (default: true)
  };
}
```

## API Reference

### Upload

```typescript
async upload(data: Uint8Array, options?: UploadOptions): Promise<UploadResult>
```

Upload a file to Filecoin with optional encryption.

**Options:**
- `fileName`: Name for the file
- `encrypted`: Whether to encrypt (default: true)
- `isPublic`: Public access when encrypted (default: true)
- `skipPaymentCheck`: Skip balance validation
- `metadata`: Custom metadata object
- `onProgress`: Progress callback

### Download

```typescript
async download(pieceCid: string, options?: DownloadOptions): Promise<DownloadResult>
```

Download and optionally decrypt a file from Filecoin.

**Options:**
- `outputPath`: Where to save the file
- `decrypt`: Attempt decryption (default: true)
- `onProgress`: Progress callback

### Share

```typescript
async share(dataIdentifier: string, options: ShareOptions): Promise<void>
```

Share an encrypted file with another wallet address.

### Access Control

```typescript
async makePublic(dataIdentifier: string): Promise<void>
async makePrivate(dataIdentifier: string): Promise<void>
```

Change file access permissions between public and private modes.

### Balance Management

```typescript
async checkBalance(): Promise<BalanceInfo>
async deposit(amount: number): Promise<void>
```

Manage USDFC tokens for Filecoin storage payments.

## Error Handling

The SDK provides structured error handling with categories:

```typescript
import { SDKError, ErrorCategory } from '@keypo/synapse-storage-sdk';

try {
  await sdk.upload(data);
} catch (error) {
  if (error instanceof SDKError) {
    console.log('Category:', error.category);
    console.log('User message:', error.userMessage);
    console.log('Recoverable:', error.recoverable);
  }
}
```

## Examples

See the [examples](./examples) directory for complete usage examples.

## License

MIT