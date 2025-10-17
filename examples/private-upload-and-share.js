import { Synapse } from '@filoz/synapse-sdk';
import { SynapseStorageSDK } from '@keypo/synapse-storage-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function privateUploadAndShare() {
  try {
    console.log('🔒 Private Upload and Sharing Example\n');
    
    // Get recipient address from command line or environment
    const recipientAddress = process.argv[2] || process.env.RECIPIENT_ADDRESS;
    
    if (!recipientAddress) {
      console.log('ℹ️  No recipient address provided - will only upload private file');
      console.log('   To test sharing, run: node private-upload-and-share.js <recipient-address>\n');
    }
    
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
    
    // Prepare private file data
    const content = 'This is PRIVATE content! Only NFT holders can decrypt this sensitive information.';
    const fileData = new TextEncoder().encode(content);
    
    console.log('📤 Uploading private file...');
    console.log(`Content: "${content}"`);
    console.log(`Size: ${fileData.length} bytes`);
    console.log('🔒 Access: Private (NFT required to decrypt)\n');
    
    // Upload private file
    const result = await sdk.upload(fileData, {
      fileName: `private-example-${Date.now()}.txt`,
      isPublic: false, // Private - requires NFT to decrypt
      metadata: {
        description: 'Private file sharing example',
        uploadedAt: new Date().toISOString(),
        accessLevel: 'NFT_REQUIRED'
      },
      serviceProvider: {
        providerId: 16, // Use reliable provider (zens-ocean)
        forceCreateDataSet: true
      },
      onProgress: (progress) => {
        console.log(`  📊 ${progress.percentage || 0}% - ${progress.message}`);
      }
    });
    
    console.log('\n✅ Private upload successful!');
    console.log(`📋 Piece CID: ${result.pieceCid}`);
    console.log(`🔗 Data Identifier: ${result.dataIdentifier}`);
    console.log(`📊 File Size: ${result.fileSize} bytes`);
    console.log(`🔐 Access Type: ${result.accessType}`);
    console.log('🎫 You own the NFT for this file and can decrypt it');
    
    // Share file if recipient provided
    if (recipientAddress) {
      console.log('\n👥 Sharing file with recipient...');
      console.log(`🎯 Recipient: ${recipientAddress}`);
      console.log('⚠️  Note: Recipient must have at least one dataset (uploaded a file) to download shared files');
      
      try {
        await sdk.share(result.pieceCid, {
          recipient: recipientAddress,
          debug: true
        });
        
        console.log('✅ File shared successfully!');
        console.log('🎫 Recipient now has an NFT to decrypt this file');
        
      } catch (shareError) {
        console.error('❌ Sharing failed:', shareError.message);
        if (shareError.message.includes('dataset')) {
          console.error('💡 The recipient may need to upload at least one file first to create a dataset');
        }
      }
    }
    
    // List files to show access control
    console.log('\n📋 Listing your files...');
    try {
      const files = await sdk.list();
      const privateFile = files.find(f => f.pieceCid === result.pieceCid);
      
      if (privateFile) {
        console.log('🔍 Private file details:');
        console.log(`  📁 Name: ${privateFile.fileName}`);
        console.log(`  🔐 Public: ${privateFile.isPublic}`);
        console.log(`  🔒 Encrypted: ${privateFile.encrypted}`);
        console.log(`  👤 Owner: ${privateFile.owner}`);
        if (privateFile.shares && privateFile.shares.length > 0) {
          console.log(`  👥 Shared with: ${privateFile.shares.join(', ')}`);
        }
      }
    } catch (error) {
      console.log('⚠️  File listing failed:', error.message);
    }
    
    console.log('\n🎉 Private upload and sharing example completed!');
    console.log(`\n💡 To download this file:`);
    console.log(`   - As owner: node download-file.js ${result.pieceCid}`);
    if (recipientAddress) {
      console.log(`   - As recipient: Use their wallet to download the same CID`);
    }
    
  } catch (error) {
    console.error('\n❌ Example failed:', error.message);
    if (error.details) console.error('Details:', error.details);
    process.exit(1);
  }
}

// Run the example
privateUploadAndShare();