import { Synapse } from '@filoz/synapse-sdk';
import { SynapseStorageSDK } from '@keypo/synapse-storage-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function basicUpload() {
  try {
    console.log('🚀 Basic Upload Example\n');
    
    // Validate required environment variables
    if (!process.env.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY is required in .env file');
    }
    if (!process.env.BUNDLER_RPC_URL) {
      throw new Error('BUNDLER_RPC_URL is required in .env file');
    }
    
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
      },
      storage: {
        capacityGB: 10,
        persistenceDays: 30,
        withCDN: true
      }
    }, process.env.PRIVATE_KEY);
    
    console.log('✅ Setup complete!\n');
    
    // Check balance
    console.log('💰 Checking balance...');
    try {
      const balance = await sdk.checkBalance();
      console.log(`USDFC Balance: ${ethers.formatUnits(balance.synapseBalance, 6)} USDFC\n`);
    } catch (error) {
      console.log('⚠️  Balance check failed, continuing anyway...\n');
    }
    
    // Prepare file data
    const content = 'Hello from Synapse Storage SDK! This is a basic upload example.';
    const fileData = new TextEncoder().encode(content);
    
    console.log('📤 Uploading file...');
    console.log(`Content: "${content}"`);
    console.log(`Size: ${fileData.length} bytes\n`);
    
    // Upload file with reliable provider
    const result = await sdk.upload(fileData, {
      fileName: `basic-example-${Date.now()}.txt`,
      isPublic: true, // Anyone can decrypt this file
      metadata: {
        description: 'Basic upload example',
        uploadedAt: new Date().toISOString()
      },
      serviceProvider: {
        providerId: 16, // Use reliable provider (zens-ocean)
        forceCreateDataSet: true
      },
      onProgress: (progress) => {
        console.log(`  📊 ${progress.percentage || 0}% - ${progress.message}`);
      }
    });
    
    console.log('\n✅ Upload successful!');
    console.log(`📋 Piece CID: ${result.pieceCid}`);
    console.log(`🔗 Data Identifier: ${result.dataIdentifier}`);
    console.log(`📊 File Size: ${result.fileSize} bytes`);
    console.log(`🔐 Access Type: ${result.accessType}`);
    
    // List files to verify
    console.log('\n📋 Listing your files...');
    const files = await sdk.list();
    console.log(`Found ${files.length} files in your account`);
    
    console.log('\n🎉 Basic upload example completed!');
    console.log(`\n💡 To download this file, use: ${result.pieceCid}`);
    
  } catch (error) {
    console.error('\n❌ Upload failed:', error.message);
    if (error.details) console.error('Details:', error.details);
    process.exit(1);
  }
}

// Run the example
basicUpload();