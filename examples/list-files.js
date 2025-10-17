import { Synapse } from '@filoz/synapse-sdk';
import { SynapseStorageSDK } from '@keypo/synapse-storage-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function listFiles() {
  try {
    console.log('📋 List Files Example\n');
    
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
      }
    }, process.env.PRIVATE_KEY);
    
    console.log('✅ Setup complete!\n');
    
    // List your files
    console.log('📋 Listing your files...');
    const files = await sdk.list({
      onProgress: ({ message }) => console.log(`  ${message}`)
    });
    
    console.log(`\n📊 Found ${files.length} files in your account:\n`);
    
    if (files.length === 0) {
      console.log('🗂️  No files found. Upload some files first using the upload examples!');
    } else {
      files.forEach((file, index) => {
        console.log(`${index + 1}. 📁 ${file.fileName || 'unnamed'}`);
        console.log(`   📋 CID: ${file.pieceCid}`);
        console.log(`   📊 Size: ${file.fileSize} bytes`);
        console.log(`   🔐 Access: ${file.isPublic ? 'Public' : 'Private'}`);
        console.log(`   🔒 Encrypted: ${file.encrypted ? 'Yes' : 'No'}`);
        console.log(`   👤 Owner: ${file.owner || 'unknown'}`);
        console.log(`   📅 Uploaded: ${file.uploadedAt || 'unknown'}`);
        
        if (file.metadata && Object.keys(file.metadata).length > 0) {
          console.log(`   📋 Metadata: ${JSON.stringify(file.metadata)}`);
        }
        
        if (file.shares && file.shares.length > 0) {
          console.log(`   👥 Shared with: ${file.shares.join(', ')}`);
        }
        
        console.log('');
      });
      
      // Show statistics
      const publicFiles = files.filter(f => f.isPublic).length;
      const privateFiles = files.filter(f => !f.isPublic).length;
      const encryptedFiles = files.filter(f => f.encrypted).length;
      const totalSize = files.reduce((sum, f) => sum + f.fileSize, 0);
      
      console.log('📊 Statistics:');
      console.log(`   🌍 Public files: ${publicFiles}`);
      console.log(`   🔒 Private files: ${privateFiles}`);
      console.log(`   🔐 Encrypted files: ${encryptedFiles}`);
      console.log(`   📦 Total size: ${totalSize} bytes`);
    }
    
    // List public files from all users
    console.log('\n🌍 Listing public files from all users...');
    try {
      const publicFiles = await sdk.listPublic({
        onProgress: ({ message }) => console.log(`  ${message}`)
      });
      
      console.log(`\n📊 Found ${publicFiles.length} public files on the network`);
      
      if (publicFiles.length > 0) {
        console.log('\nFirst 5 public files:');
        publicFiles.slice(0, 5).forEach((file, index) => {
          console.log(`${index + 1}. 📁 ${file.fileName || 'unnamed'}`);
          console.log(`   📋 CID: ${file.pieceCid}`);
          console.log(`   📊 Size: ${file.fileSize} bytes`);
          console.log(`   👤 Owner: ${file.owner || 'unknown'}`);
          console.log('');
        });
        
        if (publicFiles.length > 5) {
          console.log(`... and ${publicFiles.length - 5} more public files`);
        }
      }
    } catch (error) {
      console.log('⚠️  Public file listing failed:', error.message);
    }
    
    console.log('\n🎉 File listing example completed!');
    
  } catch (error) {
    console.error('\n❌ Listing failed:', error.message);
    if (error.details) console.error('Details:', error.details);
    process.exit(1);
  }
}

// Run the example
listFiles();