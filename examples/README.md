# Synapse Storage SDK Examples

This directory contains practical examples demonstrating how to use the Synapse Storage SDK for encrypted file storage on Filecoin.

## Quick Start

1. **Install dependencies** in your project:
   ```bash
   npm install @keypo/synapse-storage-sdk @filoz/synapse-sdk ethers viem dotenv
   ```

2. **Copy the environment template**:
   ```bash
   cp .env.example .env
   ```

3. **Configure your environment** by editing `.env`:
   - Set your `PRIVATE_KEY` (wallet private key)
   - Set your `BUNDLER_RPC_URL` (get from [ZeroDev Dashboard](https://dashboard.zerodev.app/))
   - Optionally customize other settings

4. **Run an example**:
   ```bash
   node basic-upload.js
   ```

## Examples Overview

### 📤 `basic-upload.js`
**What it does**: Uploads a simple text file as a public, encrypted file to Filecoin

**Key features**:
- ✅ Wallet setup and SDK initialization
- 💰 Balance checking
- 📤 File upload with progress tracking
- 🏪 Manual provider selection for reliability
- 📋 File listing verification

**Usage**:
```bash
node basic-upload.js
```

**Output**: Returns a piece CID that you can use for downloading

---

### 📥 `download-file.js`
**What it does**: Downloads and decrypts a file from Filecoin using its piece CID

**Key features**:
- 📥 File download with progress tracking
- 🔓 Automatic decryption (if you have permissions)
- 💾 Save to local filesystem
- 📋 Metadata display

**Usage**:
```bash
# Download a specific file
node download-file.js bafk2bzacedt7j7lnpxvzfdks7ooqvzf2lgjklhkh...

# Or set PIECE_CID_PUBLIC/PIECE_CID_PRIVATE in .env and run
node download-file.js
```

**Note**: You need the appropriate NFT permissions to decrypt private files

---

### 🔒 `private-upload-and-share.js`
**What it does**: Uploads a private file and optionally shares it with another wallet

**Key features**:
- 🔒 Private file upload (NFT required to decrypt)
- 👥 File sharing via NFT minting
- 🎫 Access control demonstration
- 📋 File permissions listing

**Usage**:
```bash
# Upload private file only
node private-upload-and-share.js

# Upload and share with a recipient
node private-upload-and-share.js 0x742d35Cc6634C0532925a3b8D93A1e05441AB7E
```

**Important**: The recipient must have uploaded at least one file (created a dataset) before they can download shared files.

---

### 📋 `list-files.js`
**What it does**: Lists all files in your account and explores public files on the network

**Key features**:
- 📂 List your personal files
- 🌍 Browse public files from all users
- 📊 File statistics and metadata
- 🔍 Access control information

**Usage**:
```bash
node list-files.js
```

---

### 🗑️ `delete-file.js`
**What it does**: Deletes a file from the permissions registry, making it no longer downloadable

**Key features**:
- 🔍 File verification before deletion
- ⚠️ Clear warnings about deletion behavior
- 📋 Step-by-step progress tracking
- 🧪 Post-deletion verification
- 📊 Detailed deletion summary

**Usage**:
```bash
# Delete a specific file
node delete-file.js bafk2bzacedt7j7lnpxvzfdks7ooqvzf2lgjklhkh...

# Or set PIECE_CID_TO_DELETE in .env and run
node delete-file.js
```

**Important**: 
- Only the file owner can delete files
- Deletion removes permissions but data remains on Filecoin
- All shared access is revoked
- Future SDK versions will add scheduled data deletion

## Configuration

### Environment Variables (`.env`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PRIVATE_KEY` | ✅ | Your wallet private key | `0x123...` or `123...` |
| `BUNDLER_RPC_URL` | ✅ | ZeroDev bundler URL | `https://rpc.zerodev.app/api/v3/YOUR_ID` |
| `NETWORK` | | Filecoin network | `calibration` (default) |
| `RPC_URL` | | Blockchain RPC endpoint | `https://sepolia.base.org` |
| `REGISTRY_ADDRESS` | | Permissions registry contract | `0x8370eE1a...` |
| `VALIDATION_ADDRESS` | | Validation contract | `0x35ADB6b...` |

### Provider Selection

The examples use **provider 16 (zens-ocean)** by default, which is known to be reliable on the Calibration testnet. You can modify the `serviceProvider` settings in each example:

```javascript
serviceProvider: {
  providerId: 16,           // 8=THCloudAI, 16=zens-ocean
  forceCreateDataSet: true  // Create new dataset (costs ~1-2 USDFC)
}
```

## Common Use Cases

### 1. Simple File Storage
Use `basic-upload.js` to store files that anyone can decrypt:
- ✅ Public files (anyone can access)
- ✅ Encrypted for privacy in transit
- ✅ Stored permanently on Filecoin

### 2. Private Document Sharing
Use `private-upload-and-share.js` for sensitive documents:
- 🔒 Only you can decrypt initially
- 👥 Share access by minting NFTs to specific wallets
- 🎫 Recipients need the NFT to decrypt

### 3. File Management
Use `list-files.js` and `download-file.js` to manage your files:
- 📋 See all your files and their permissions
- 📥 Download and decrypt files you have access to
- 🌍 Explore public files from other users

## Troubleshooting

### Upload Issues
- **Provider timeouts**: Examples use reliable providers (8, 16) by default
- **Insufficient balance**: Check USDFC balance; examples show how to deposit
- **Gas estimation failures**: Try using a different provider or wait a few minutes

### Download Issues  
- **"File not found"**: Verify the piece CID is correct
- **"Permission denied"**: For private files, ensure you have the required NFT
- **"No dataset found"**: For shared files, recipient must upload at least one file first

### Environment Issues
- **"Private key required"**: Set `PRIVATE_KEY` in your `.env` file
- **"Bundler RPC required"**: Set `BUNDLER_RPC_URL` with your ZeroDev project ID
- **BigInt serialization errors**: Normal and safe to ignore

## Next Steps

After running the examples:

1. **Integrate into your app**: Copy the patterns from these examples
2. **Add error handling**: Examples show basic error handling patterns
3. **Implement UI**: Use the progress callbacks to show upload/download progress
4. **Scale up**: The SDK handles larger files and batch operations

## Need Help?

- 📖 **Full documentation**: See the main [README.md](../README.md)
- 🐛 **Issues**: Report bugs in the project repository
- 💡 **Questions**: Check the troubleshooting section in the main README

---

**Built with ❤️ for the decentralized web**