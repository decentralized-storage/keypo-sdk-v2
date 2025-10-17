import { Synapse } from '@filoz/synapse-sdk';
import { SynapseStorageSDK } from '@keypo/synapse-storage-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function deleteFile() {
  try {
    console.log('🗑️  Delete File Example\n');
    
    // Get piece CID from command line argument or environment
    const pieceCid = process.argv[2] || process.env.PIECE_CID_TO_DELETE;
    
    if (!pieceCid) {
      console.log('❌ No piece CID provided!');
      console.log('\nUsage:');
      console.log('  node delete-file.js <piece-cid>');
      console.log('  OR set PIECE_CID_TO_DELETE in .env file');
      console.log('\nTo get a piece CID to delete:');
      console.log('  1. Run: node list-files.js');
      console.log('  2. Copy a piece CID from your files');
      console.log('  3. Run: node delete-file.js <piece-cid>\n');
      process.exit(1);
    }
    
    // Validate required environment variables
    if (!process.env.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY is required in .env file');
    }
    if (!process.env.BUNDLER_RPC_URL) {
      throw new Error('BUNDLER_RPC_URL is required in .env file');
    }
    
    console.log(`🎯 Target file CID: ${pieceCid}`);
    console.log('⚠️  WARNING: This will remove the file from the permissions registry');
    console.log('   The file will no longer be downloadable through the SDK');
    console.log('   However, the data remains stored on Filecoin\n');
    
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
    
    // First, try to find the file in your account
    console.log('🔍 Looking for file in your account...');
    try {
      const files = await sdk.list();
      const targetFile = files.find(f => f.pieceCid === pieceCid);
      
      if (targetFile) {
        console.log('✅ File found in your account:');
        console.log(`   📁 Name: ${targetFile.fileName || 'unnamed'}`);
        console.log(`   📊 Size: ${targetFile.fileSize} bytes`);
        console.log(`   🔐 Access: ${targetFile.isPublic ? 'Public' : 'Private'}`);
        console.log(`   👤 Owner: ${targetFile.owner}`);
        if (targetFile.shares && targetFile.shares.length > 0) {
          console.log(`   👥 Shared with: ${targetFile.shares.join(', ')}`);
        }
        console.log('');
      } else {
        console.log('⚠️  File not found in your account');
        console.log('   You can only delete files you own or have permission to delete\n');
      }
    } catch (error) {
      console.log('⚠️  Could not list files:', error.message);
    }
    
    // Confirm deletion
    console.log('⚠️  Are you sure you want to delete this file?');
    console.log('   This action will:');
    console.log('   • Remove the file from the permissions registry');
    console.log('   • Make the file no longer downloadable via the SDK');
    console.log('   • Revoke access for all shared users');
    console.log('   • Keep the data stored on Filecoin (not physically deleted)');
    console.log('');
    
    // In a real application, you might want to add a confirmation prompt
    // For this example, we'll proceed with a warning
    console.log('🗑️  Proceeding with deletion in 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Delete the file
    console.log('🗑️  Deleting file from permissions registry...');
    const deleteResult = await sdk.delete(pieceCid, {
      debug: true,
      onProgress: ({ message, step, total }) => {
        console.log(`  📊 Step ${step}/${total}: ${message}`);
      }
    });
    
    console.log('\n✅ File deletion completed!');
    console.log(`📋 Transaction Hash: ${deleteResult.transactionHash}`);
    console.log(`⏰ Completed at: ${new Date().toISOString()}`);
    
    // Verify deletion by trying to list files again
    console.log('\n🔍 Verifying deletion...');
    try {
      const filesAfter = await sdk.list();
      const stillExists = filesAfter.find(f => f.pieceCid === pieceCid);
      
      if (!stillExists) {
        console.log('✅ Confirmed: File no longer appears in your account');
      } else {
        console.log('⚠️  File still appears in your account (may take time to update)');
      }
      
      console.log(`📊 Files in account after deletion: ${filesAfter.length}`);
      
    } catch (error) {
      console.log('⚠️  Could not verify deletion:', error.message);
    }
    
    // Try to download the file to confirm it's no longer accessible
    console.log('\n🧪 Testing file access after deletion...');
    try {
      await sdk.download(pieceCid, { decrypt: false });
      console.log('⚠️  Unexpected: File is still downloadable');
    } catch (downloadError) {
      if (downloadError.message.includes('not found') || 
          downloadError.message.includes('permission') ||
          downloadError.message.includes('access')) {
        console.log('✅ Confirmed: File is no longer accessible via SDK');
      } else {
        console.log(`⚠️  Download failed with different error: ${downloadError.message}`);
      }
    }
    
    console.log('\n🎉 File deletion example completed!');
    console.log('\n📋 Summary:');
    console.log('   • File removed from permissions registry');
    console.log('   • File no longer downloadable via SDK');
    console.log('   • All shared access revoked');
    console.log('   • Original data remains on Filecoin network');
    console.log('   • Future SDK versions will add scheduled data deletion');
    
  } catch (error) {
    console.error('\n❌ Deletion failed:', error.message);
    
    if (error.message.includes('not found')) {
      console.error('💡 The file may not exist or you may not have permission to delete it');
    } else if (error.message.includes('owner')) {
      console.error('💡 You can only delete files you own');
    } else if (error.message.includes('transaction')) {
      console.error('💡 Transaction failed - check your wallet balance and network connection');
    }
    
    if (error.details) console.error('Details:', error.details);
    process.exit(1);
  }
}

// Run the example
deleteFile();