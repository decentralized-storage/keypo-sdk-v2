import { Synapse } from '@filoz/synapse-sdk';
import { SynapseStorageSDK } from '@keypo/synapse-storage-sdk';
import { ethers } from 'ethers';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function downloadFile() {
  try {
    console.log('📥 Download File Example\n');
    
    // Get piece CID from command line argument or environment
    const pieceCid = process.argv[2] || process.env.PIECE_CID_PUBLIC || process.env.PIECE_CID_PRIVATE;
    
    if (!pieceCid) {
      console.log('❌ No piece CID provided!');
      console.log('\nUsage:');
      console.log('  node download-file.js <piece-cid>');
      console.log('  OR set PIECE_CID_PUBLIC or PIECE_CID_PRIVATE in .env file\n');
      process.exit(1);
    }
    
    // Validate required environment variables
    if (!process.env.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY is required in .env file');
    }
    if (!process.env.BUNDLER_RPC_URL) {
      throw new Error('BUNDLER_RPC_URL is required in .env file');
    }
    
    console.log(`📋 Piece CID: ${pieceCid}`);
    
    // Initialize wallet and provider
    console.log('🔑 Setting up wallet...');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://sepolia.base.org');
    const signer = wallet.connect(provider);
    
    console.log(`📍 Wallet address: ${await signer.getAddress()}`);
    
    // Initialize Synapse
    console.log('🌐 Connecting to Synapse...');
    const synapse = await Synapse.create({
      signer,
      withCDN: true,
    });
    
    // Initialize SDK
    console.log('🔧 Initializing SDK...');
    const sdk = new SynapseStorageSDK(synapse, {
      network: process.env.NETWORK || 'calibration',
      rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
      encryption: {
        registryAddress: process.env.REGISTRY_ADDRESS || '0x8370eE1a51B5F31cc10E2f4d786Ff20198B10BBE',
        validationAddress: process.env.VALIDATION_ADDRESS || '0x35ADB6b999AbcD5C9CdF2262c7190C7b96ABcE4C',
        bundlerRpcUrl: process.env.BUNDLER_RPC_URL
      }
    }, process.env.PRIVATE_KEY);
    
    console.log('✅ Setup complete!\n');
    
    // Download file
    console.log('📥 Downloading file...');
    const result = await sdk.download(pieceCid, {
      decrypt: true, // Attempt to decrypt if encrypted
      onProgress: (progress) => {
        console.log(`  📊 ${progress.message}`);
        if (progress.bytesDownloaded && progress.totalBytes) {
          const percent = ((progress.bytesDownloaded / progress.totalBytes) * 100).toFixed(1);
          console.log(`  📈 Progress: ${percent}% (${progress.bytesDownloaded}/${progress.totalBytes} bytes)`);
        }
      }
    });
    
    console.log('\n✅ Download successful!');
    console.log(`📊 File Size: ${result.fileSize} bytes`);
    console.log(`🔓 Decrypted: ${result.decrypted}`);
    console.log(`📁 File Name: ${result.metadata?.name || 'unknown'}`);
    
    // Display content (if text)
    try {
      const content = new TextDecoder().decode(result.data);
      console.log(`📄 Content: "${content}"`);
    } catch (error) {
      console.log('📄 Content: [Binary data - cannot display as text]');
    }
    
    // Save to file
    const timestamp = Date.now();
    const filename = `downloaded-${timestamp}.txt`;
    writeFileSync(filename, result.data);
    console.log(`💾 Saved to: ${filename}`);
    
    // Display metadata if available
    if (result.metadata && Object.keys(result.metadata).length > 0) {
      console.log('📋 Metadata:', JSON.stringify(result.metadata, null, 2));
    }
    
    console.log('\n🎉 Download example completed!');
    
  } catch (error) {
    console.error('\n❌ Download failed:', error.message);
    
    if (error.message.includes('NFT') || error.message.includes('permission')) {
      console.error('💡 Note: You may need the required NFT or permissions to access this file');
      console.error('    For private files, only the owner or someone with a shared NFT can decrypt them');
    }
    
    if (error.details) console.error('Details:', error.details);
    process.exit(1);
  }
}

// Run the example
downloadFile();