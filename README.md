# Keypo Typescript SDK

A serverless SDK for sharing private data on the web. Access control logic (i.e. who can access what files) are stored on-chain. A distributed key management network (Lit Protocol) enforces the ACL when encrypting/decrypting files. All encrypted data is stored on Filecoin and payment for storage is handled on-chain.

A great solution for projects that want self custody, no vendor lock-in and minimal recurring expenses.

## Features

- 🔐 **End-to-end encryption** with Lit Protocol
- 📁 **Filecoin storage** via Synapse network
- 🎫 **NFT-based access control** with smart contracts
- 🌍 **Public/private file modes** with granular permissions
- 👥 **File sharing** by minting access NFTs
- 🗑️ **File deletion** from permissions registry
- 📋 **File listing** with metadata and filtering
- 💰 **Payment management** for USDFC storage tokens
- 🦺 **Type-safe** TypeScript implementation
- ⚡ **Account abstraction** via ZeroDev for gasless transactions

## Installation

```bash
npm install @keypo/synapse-storage-sdk
```

## Peer Dependencies

```bash
npm install @filoz/synapse-sdk ethers viem @zerodev/sdk @lit-protocol/lit-client
```

## Quick Start

```typescript
import { Synapse } from '@filoz/synapse-sdk';
import { SynapseStorageSDK } from '@keypo/synapse-storage-sdk';
import { ethers } from 'ethers';

// Initialize Synapse
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!);
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const signer = wallet.connect(provider);

const synapse = await Synapse.create({
  signer,
  withCDN: true,
});

// Initialize SDK
const sdk = new SynapseStorageSDK(synapse, {
  network: 'calibration',
  rpcUrl: 'https://sepolia.base.org',
  encryption: {
    registryAddress: '0x8370eE1a51B5F31cc10E2f4d786Ff20198B10BBE',
    validationAddress: '0x35ADB6b999AbcD5C9CdF2262c7190C7b96ABcE4C',
    bundlerRpcUrl: 'https://rpc.zerodev.app/api/v3/YOUR_PROJECT_ID'
  },
  storage: {
    capacityGB: 10,
    persistenceDays: 30,
    withCDN: true
  }
}, process.env.PRIVATE_KEY);

// Upload encrypted file
const fileData = new TextEncoder().encode("Hello, Filecoin!");
const result = await sdk.upload(fileData, {
  fileName: 'hello.txt',
  isPublic: false, // Private - requires NFT to decrypt
  onProgress: (progress) => console.log(progress.message)
});

console.log('File uploaded:', result.pieceCid);
console.log('Data identifier:', result.dataIdentifier);
```

## Configuration

### SDKConfig

```typescript
interface SDKConfig {
  /** Filecoin network */
  network: 'mainnet' | 'calibration';
  
  /** RPC endpoint for the blockchain */
  rpcUrl?: string;
  
  /** Encryption and smart contract settings */
  encryption?: {
    registryAddress: string;      // Permissions registry contract
    validationAddress: string;    // Validation contract  
    bundlerRpcUrl: string;       // ZeroDev bundler for account abstraction
  };
  
  /** Filecoin storage settings */
  storage?: {
    capacityGB?: number;         // Storage capacity (default: 10GB)
    persistenceDays?: number;    // Storage duration (default: 30 days)  
    withCDN?: boolean;          // Enable CDN acceleration (default: true)
  };
}
```

## Complete API Reference

### Upload Files

```typescript
async upload(data: Uint8Array, options?: UploadOptions): Promise<UploadResult>
```

Upload and encrypt a file to Filecoin with NFT-based access control.

**Parameters:**
- `data`: File data as Uint8Array
- `options`: Upload configuration (all optional)

**UploadOptions:**
```typescript
interface UploadOptions {
  fileName?: string;              // File name for metadata
  isPublic?: boolean;            // Public access when encrypted (default: true)
  skipPaymentCheck?: boolean;     // Skip USDFC balance validation
  metadata?: Record<string, any>; // Custom metadata
  onProgress?: (progress: UploadProgress) => void; // Progress callback
  callbacks?: StorageCallbacks;   // Detailed operation callbacks
  serviceProvider?: {             // Manual provider selection (optional)
    providerId?: number;          // Specific provider ID (e.g., 8, 16)
    providerAddress?: string;     // Provider wallet address
    forceCreateDataSet?: boolean; // Force new dataset creation
  };
}
```

**Returns:** `UploadResult` with `pieceCid`, `dataIdentifier`, `encrypted`, `accessType`, and metadata

#### Provider Selection (Optional)

By default, the SDK automatically selects the best available provider using this priority:
1. **Existing datasets** - Reuses your existing datasets for faster uploads
2. **Provider health** - Automatically pings providers to find responsive ones  
3. **Random selection** - Falls back to random selection from approved providers

For better reliability, you can manually specify a provider:

```typescript
// Manual provider selection (recommended for reliability)
serviceProvider: {
  providerId: 16,              // Use specific provider (8=THCloudAI, 16=zens-ocean)
  forceCreateDataSet: true     // Create new dataset (costs ~1-2 USDFC)
}
```

**Available Providers** (Calibration testnet):
- **8** - THCloudAI (reliable)
- **16** - zens-ocean (reliable)  
- **2** - pspsps
- **3** - ezpdpz-calib (may have issues)
- **4** - infrafolio-calib
- **13** - filstarry-pdp

#### Examples

**Simple upload (auto-provider selection):**
```typescript
const fileData = new TextEncoder().encode("My secret data");
const result = await sdk.upload(fileData, {
  fileName: 'secret.txt',
  isPublic: false // Private - only NFT owner can access
});
```

**Upload with manual provider selection:**
```typescript
const result = await sdk.upload(fileData, {
  fileName: 'secret.txt',
  isPublic: false,
  serviceProvider: {
    providerId: 16,           // Use zens-ocean provider
    forceCreateDataSet: true  // Create new dataset
  },
  onProgress: (progress) => {
    console.log(`${progress.percentage}% - ${progress.message}`);
  }
});
```

**Upload with detailed callbacks:**
```typescript
const result = await sdk.upload(fileData, {
  fileName: 'secret.txt',
  isPublic: false,
  callbacks: {
    onProviderSelected: (provider) => {
      console.log(`Using provider: ${provider.name}`);
    },
    onDataSetCreationStarted: (tx, statusUrl) => {
      console.log(`Creating dataset: ${tx.hash}`);
    },
    onUploadComplete: (piece) => {
      console.log(`Upload complete: ${piece}`);
    }
  }
});
```

### Download Files

```typescript
async download(pieceCid: string, options?: DownloadOptions): Promise<DownloadResult>
```

Download and optionally decrypt a file from Filecoin.

**DownloadOptions:**
```typescript
interface DownloadOptions {
  outputPath?: string;           // Local file path to save
  decrypt?: boolean;             // Attempt decryption (default: true)
  onProgress?: (progress: DownloadProgress) => void;
}
```

**Example:**
```typescript
const result = await sdk.download('bafk...', {
  outputPath: './downloaded-file.txt',
  decrypt: true,
  onProgress: ({ message, bytesDownloaded, totalBytes }) => {
    console.log(`${message} (${bytesDownloaded}/${totalBytes} bytes)`);
  }
});

console.log('File data:', new TextDecoder().decode(result.data));
```

### List Files

```typescript
async list(options?: ListOptions): Promise<FileListEntry[]>
```

List all files owned by or shared with the current wallet.

**Example:**
```typescript
const files = await sdk.list({
  onProgress: ({ message }) => console.log(message)
});

files.forEach(file => {
  console.log(`${file.fileName} (${file.pieceCid})`);
  console.log(`  Size: ${file.fileSize} bytes`);
  console.log(`  Access: ${file.isPublic ? 'Public' : 'Private'}`);
  console.log(`  Owner: ${file.owner}`);
  console.log(`  Uploaded: ${file.uploadedAt}`);
});
```

### List Public Files

```typescript
async listPublic(options?: ListPublicOptions): Promise<FileListEntry[]>
```

List all public files from all users on the network.

**Example:**
```typescript
const publicFiles = await sdk.listPublic({
  onProgress: ({ message }) => console.log(message)
});

console.log(`Found ${publicFiles.length} public files`);
```

### Share Files

```typescript
async share(pieceCid: string, options: ShareOptions): Promise<void>
```

Share a private file with another wallet by minting an access NFT.

**📋 Important**: The recipient wallet must have at least one existing dataset (created by uploading a file) before they can download shared files. If the recipient has never uploaded a file, they should upload at least one file first to establish their dataset.

**ShareOptions:**
```typescript
interface ShareOptions {
  recipient: string;             // Wallet address to share with
  debug?: boolean;               // Enable debug logging
}
```

**Example:**
```typescript
await sdk.share('bafk...', {
  recipient: '0x742d35Cc6634C0532925a3b8D93A1e05441AB7E',
  debug: true
});

console.log('File shared successfully');
```

**Recipient Requirements:**
```typescript
// Recipient must first create a dataset by uploading any file
const recipientSDK = new SynapseStorageSDK(synapse, config, recipientPrivateKey);
await recipientSDK.upload(new TextEncoder().encode("init"), {
  fileName: "init.txt",
  isPublic: true // Can be any file to establish dataset
});

// Now the recipient can download shared files
const sharedFile = await recipientSDK.download(sharedPieceCid);
```

### Delete Files

```typescript
async delete(pieceCid: string, options?: DeleteOptions): Promise<DeleteResult>
```

Delete a file from the permissions registry (revokes access, data remains on Filecoin).

**📋 Important**: The delete function currently removes the file from the permissions registry, making it no longer downloadable through the SDK. However, the pieceCID remains stored on the Filecoin network. In a future version of the SDK, we will add the ability to schedule the deletion of the pieceCID from the storage provider.

**Example:**
```typescript
const result = await sdk.delete('bafk...', {
  debug: true,
  onProgress: ({ message, step, total }) => {
    console.log(`Step ${step}/${total}: ${message}`);
  }
});

console.log(`File deleted: ${result.transactionHash}`);
```

### Balance Management

```typescript
async checkBalance(): Promise<BalanceInfo>
async deposit(amount: number): Promise<void>
```

Manage USDFC tokens for paying Filecoin storage costs.

**Example:**
```typescript
// Check current balances
const balance = await sdk.checkBalance();
console.log(`FIL: ${balance.formatted.fil}`);
console.log(`USDFC: ${balance.formatted.usdfc}`);
console.log(`Synapse: ${balance.formatted.synapse}`);

// Deposit USDFC tokens (if needed)
if (balance.usdfc < 1000000) { // Less than 1 USDFC
  await sdk.deposit(5); // Deposit 5 USDFC
}
```

## File Types and Metadata

### FileListEntry

```typescript
interface FileListEntry {
  pieceCid: string;              // Filecoin piece CID
  dataIdentifier?: string;       // Smart contract data ID
  fileName?: string;             // Original file name
  fileSize: number;              // Size in bytes
  isPublic: boolean;             // Public vs private access
  encrypted: boolean;            // Whether file is encrypted
  owner?: string;                // File owner wallet address
  uploader?: string;             // Uploader wallet address
  uploadedAt?: string;           // Upload timestamp
  contractAddress?: string;      // Associated smart contract
  metadata?: Record<string, any>; // Custom metadata
  shares?: string[];             // Addresses file is shared with
  status?: string;               // File status
}
```

## Error Handling

The SDK provides structured error handling with detailed error information:

```typescript
import { SDKError, ErrorCategory } from '@keypo/synapse-storage-sdk';

try {
  const result = await sdk.upload(data);
} catch (error) {
  if (error instanceof SDKError) {
    console.log('Category:', error.category); // 'NETWORK', 'VALIDATION', etc.
    console.log('User message:', error.userMessage); // User-friendly message
    console.log('Recoverable:', error.recoverable); // Can user retry?
    console.log('Details:', error.details); // Technical details
  }
}
```

### Error Categories

- `VALIDATION`: Input validation errors
- `NETWORK`: Network connectivity issues  
- `PAYMENT`: USDFC balance or payment failures
- `ENCRYPTION`: Lit Protocol encryption errors
- `CONTRACT`: Smart contract transaction failures
- `STORAGE`: Filecoin storage errors
- `FILE`: File operation errors
- `CONFIG`: Configuration errors

## Advanced Usage

### Custom Progress Tracking

```typescript
const result = await sdk.upload(data, {
  fileName: 'large-file.bin',
  onProgress: ({ message, step, total, bytesProcessed }) => {
    // Update progress bar
    const percentage = step && total ? (step / total * 100).toFixed(1) : 0;
    console.log(`${percentage}% - ${message}`);
    
    if (bytesProcessed) {
      console.log(`Processed: ${bytesProcessed} bytes`);
    }
  }
});
```

### Batch Operations

```typescript
// Upload multiple files
const files = [
  { name: 'doc1.txt', data: new TextEncoder().encode('Document 1') },
  { name: 'doc2.txt', data: new TextEncoder().encode('Document 2') },
];

const results = await Promise.all(
  files.map(file => sdk.upload(file.data, { fileName: file.name }))
);

console.log(`Uploaded ${results.length} files`);

// Share with multiple recipients
const recipients = ['0x123...', '0x456...', '0x789...'];
await Promise.all(
  recipients.map(recipient => 
    sdk.share(pieceCid, { recipient })
  )
);
```

### File Filtering and Search

```typescript
const allFiles = await sdk.list();

// Filter by owner
const myFiles = allFiles.filter(file => 
  file.owner?.toLowerCase() === myWallet.toLowerCase()
);

// Filter by metadata
const importantFiles = allFiles.filter(file =>
  file.metadata?.tags?.includes('important')
);

// Sort by upload date
const recentFiles = allFiles
  .sort((a, b) => 
    new Date(b.uploadedAt!).getTime() - new Date(a.uploadedAt!).getTime()
  )
  .slice(0, 10); // Most recent 10 files
```

## Network Configuration

### Base Sepolia Testnet (Recommended)

```typescript
const config = {
  network: 'calibration',
  rpcUrl: 'https://sepolia.base.org',
  encryption: {
    registryAddress: '0x8370eE1a51B5F31cc10E2f4d786Ff20198B10BBE',
    validationAddress: '0x35ADB6b999AbcD5C9CdF2262c7190C7b96ABcE4C',
    bundlerRpcUrl: 'https://rpc.zerodev.app/api/v3/YOUR_PROJECT_ID'
  }
};
```

### Environment Variables

Create a `.env` file:

```bash
# Wallet private key (with or without 0x prefix)
PRIVATE_KEY=your_private_key_here

# ZeroDev project ID (get from https://dashboard.zerodev.app/)
ZERODEV_PROJECT_ID=your_project_id

# Optional: Enable debug logging
DEBUG=true
```

## Security Considerations

- **Private Key Management**: Store private keys securely, never commit to version control
- **Public vs Private**: Public files can be decrypted by anyone, private files require NFT ownership
- **File Deletion**: Deletion removes access permissions but encrypted data remains on Filecoin
- **Network Security**: Use HTTPS RPC endpoints and verify contract addresses
- **Access Control**: NFT-based permissions are enforced by smart contracts

## Troubleshooting

### Common Issues

1. **"Private key required" error**
   - Ensure private key is provided to SDK constructor
   - Check private key format (with or without 0x prefix both work)

2. **"Insufficient balance" error**
   - Check USDFC token balance with `sdk.checkBalance()`
   - Deposit more tokens or use `skipPaymentCheck: true` for testing

3. **"File not found" error**
   - Verify the piece CID is correct
   - Check if file was uploaded with same wallet address
   - For shared files: Ensure the recipient wallet has created at least one dataset (uploaded a file)

4. **Upload timeouts or provider issues**
   - Some providers may be unreliable (especially provider 3 on calibration)
   - Use manual provider selection with reliable providers:
     ```typescript
     serviceProvider: { providerId: 16 } // or 8
     ```
   - Check provider status with the list providers script

5. **Transaction hanging**
   - ZeroDev bundler may be slow, transactions have 30-60s timeouts
   - Check network status and try again

6. **Dataset creation failures**
   - Ensure sufficient USDFC balance (1-2 USDFC needed for new datasets)
   - Try using existing datasets first: `forceCreateDataSet: false`
   - Check if provider supports dataset creation

7. **Encryption/Decryption failures**
   - Ensure Lit Protocol network is accessible
   - Check wallet has permission to decrypt (NFT ownership for private files)

### Debug Mode

Enable debug logging for detailed operation information:

```typescript
const result = await sdk.upload(data, { debug: true });
const files = await sdk.list({ debug: true });
await sdk.share(pieceCid, { recipient: '0x...', debug: true });
```

## Contributing

This SDK is part of the Keypo ecosystem for decentralized file storage. For issues and feature requests, please use the project repository.

## License

MIT License - see [LICENSE](./LICENSE) file for details.

---

**Built with ❤️ for the decentralized web**
