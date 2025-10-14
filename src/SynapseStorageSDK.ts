/**
 * Main SDK class for Synapse Storage operations
 */

import type { Synapse } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { KernelVersionToAddressesMap, KERNEL_V3_3 } from '@zerodev/sdk/constants';

import type {
  SDKConfig,
  UploadOptions,
  UploadResult,
  DownloadOptions,
  DownloadResult,
  FileEntry,
  BalanceInfo,
  ShareOptions,
  DataMetadata,
  ExtendedMetadata
} from './types/index.js';

import { LitEncryption } from './modules/encryption/LitEncryption.js';
import { ContractManager } from './modules/contracts/ContractManager.js';
import { StorageManager } from './modules/storage/StorageManager.js';
import { validateSDKConfig, validatePieceCid, validateAddress, validateDataIdentifier } from './utils/validation.js';
import { createValidationError, ErrorHandler } from './errors/index.js';
import { getKernelClient } from './utils/getKernelClient.js';

/**
 * Main SDK class for encrypted file storage on Filecoin via Synapse
 */
export class SynapseStorageSDK {
  private synapse: Synapse;
  private config: SDKConfig;
  private encryption?: LitEncryption;
  private contracts?: ContractManager;
  private storage: StorageManager;
  private privateKey?: string;

  constructor(synapse: Synapse, config: SDKConfig, privateKey?: string) {
    validateSDKConfig(config);
    
    this.synapse = synapse;
    this.config = config;
    this.privateKey = privateKey;
    
    // Initialize storage manager (always needed)
    this.storage = new StorageManager(synapse, config.storage);
    
    // Initialize encryption and contracts if configured
    if (config.encryption && privateKey) {
      this.encryption = new LitEncryption({
        privateKey,
        registryAddress: config.encryption.registryAddress,
        validationAddress: config.encryption.validationAddress,
        bundlerRpcUrl: config.encryption.bundlerRpcUrl
      });
      
      this.contracts = new ContractManager({
        registryAddress: config.encryption.registryAddress,
        validationAddress: config.encryption.validationAddress,
        bundlerRpcUrl: config.encryption.bundlerRpcUrl
      });
    }
  }

  /**
   * Upload a file to Filecoin with optional encryption
   */
  public async upload(data: Uint8Array, options?: UploadOptions): Promise<UploadResult> {
    try {
      const fileName = options?.fileName || 'unnamed';
      const isPublic = options?.isPublic ?? true;
      
      // Report progress
      options?.onProgress?.({
        stage: 'preparing',
        message: 'Preparing file...',
        percentage: 0
      });

      // Create metadata
      const metadata: DataMetadata = {
        name: fileName,
        type: 'binary',
        userMetaData: options?.metadata
      };

      let uploadData: Uint8Array;
      let dataIdentifier: string | undefined;
      let contractTxHash: string | undefined;
      let encryptedPayload: any;

      // All files are encrypted - check encryption configuration
      if (!this.encryption || !this.privateKey) {
        throw createValidationError('Encryption not configured', {
          userMessage: 'SDK was not initialized with encryption configuration'
        });
      }

      options?.onProgress?.({
        stage: 'encrypting',
        message: 'Encrypting file...',
        percentage: 20
      });

      encryptedPayload = await this.encryption.encrypt(data, metadata);
      dataIdentifier = encryptedPayload.dataIdentifier;
      
      // Prepare upload payload (without smart contract data)
      const uploadPayload = {
        ciphertext: encryptedPayload.ciphertext,
        dataToEncryptHash: encryptedPayload.dataToEncryptHash,
        accessControlConditions: encryptedPayload.accessControlConditions,
        metadata: encryptedPayload.metadata,
        dataIdentifier: encryptedPayload.dataIdentifier,
      };
      
      uploadData = new TextEncoder().encode(JSON.stringify(uploadPayload));

      // Validate payment
      if (!options?.skipPaymentCheck) {
        options?.onProgress?.({
          stage: 'preparing',
          message: 'Validating payment...',
          percentage: 30
        });
        await this.storage.validatePayment(false);
      }

      // Upload to Filecoin
      options?.onProgress?.({
        stage: 'uploading',
        message: 'Uploading to Filecoin...',
        percentage: 40
      });

      const { pieceCid, datasetCreated } = await this.storage.upload(
        uploadData,
        undefined,
        options?.onProgress
      );

      // Deploy smart contracts for encrypted files
      if (encryptedPayload && this.contracts && this.privateKey) {
        options?.onProgress?.({
          stage: 'deploying-contracts',
          message: 'Deploying permission contracts...',
          percentage: 80
        });

        try {
          // Create enhanced metadata with piece CID
          const enhancedMetadata: ExtendedMetadata = {
            ...metadata,
            filecoinStorageInfo: {
              pieceCid: pieceCid.toV1().toString(),
              uploadTimestamp: new Date().toISOString(),
              datasetCreated
            },
            accessType: isPublic ? 'public' : 'private'
          };

          // Get account and authorization for smart contracts
          const formattedPrivateKey = this.privateKey.startsWith('0x') 
            ? this.privateKey 
            : `0x${this.privateKey}`;
          const account = privateKeyToAccount(formattedPrivateKey as `0x${string}`);
          
          // Create wallet client for signing
          const walletClient = createWalletClient({
            account,
            chain: baseSepolia,
            transport: http(),
          });

          // Get kernel authorization
          const kernelVersion = KERNEL_V3_3;
          const kernelAddresses = KernelVersionToAddressesMap[kernelVersion];
          const authorization = await walletClient.signAuthorization({
            contractAddress: kernelAddresses.accountImplementationAddress as `0x${string}`,
            account,
          });

          // Create kernel client for smart contract operations
          const kernelClient = await getKernelClient(
            account,
            baseSepolia,
            this.config.encryption!.bundlerRpcUrl,
            authorization,
            process.env.DEBUG === 'true'
          );

          // Deploy contracts and mint NFT (matches CLI logic exactly)
          contractTxHash = await this.contracts.deployPermissionsAndMintNFT(
            dataIdentifier!,
            enhancedMetadata,
            kernelClient,
            account.address,
            isPublic,
            process.env.DEBUG === 'true'
          );
        } catch (contractError) {
          console.warn('Smart contract deployment failed, but file upload succeeded:', contractError);
        }
      }

      options?.onProgress?.({
        stage: 'finalizing',
        message: 'Complete!',
        percentage: 100
      });

      return {
        pieceCid: pieceCid.toV1().toString(),
        dataIdentifier,
        encrypted: true,
        accessType: isPublic ? 'public' : 'private',
        fileSize: data.length,
        fileName,
        datasetCreated,
        contractTxHash
      };
    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
  }

  /**
   * Download a file from Filecoin and optionally decrypt it
   */
  public async download(pieceCid: string, options?: DownloadOptions): Promise<DownloadResult> {
    try {
      validatePieceCid(pieceCid);
      
      options?.onProgress?.({
        stage: 'fetching',
        message: 'Downloading from Filecoin...',
        percentage: 20
      });

      // Download from Filecoin
      const rawData = await this.storage.download(pieceCid, options?.onProgress);
      
      let finalData = rawData;
      let metadata: DataMetadata | undefined;
      let decrypted = false;

      // Try to decrypt if requested - all SDK files are encrypted
      if (options?.decrypt !== false) {
        try {
          // Parse as JSON to check if it's encrypted
          const jsonStr = new TextDecoder().decode(rawData);
          const parsed = JSON.parse(jsonStr);

          console.log("[DEBUG] parsed:", parsed);
          if (parsed.ciphertext && parsed.dataToEncryptHash && parsed.accessControlConditions) {
            console.log("[DEBUG] decrypting file...");
            if (!this.encryption || !this.privateKey) {
              throw createValidationError('Encryption not configured', {
                userMessage: 'SDK was not initialized with encryption configuration for decryption'
              });
            }

            options?.onProgress?.({
              stage: 'decrypting',
              message: 'Decrypting file...',
              percentage: 60
            });

            finalData = await this.encryption.decrypt(parsed);
            metadata = parsed.metadata;
            decrypted = true;
          }
        } catch (parseError) {
          // Not encrypted JSON, return as-is
          console.debug('File is not encrypted or not JSON format');
        }
      }

      options?.onProgress?.({
        stage: 'saving',
        message: 'Complete!',
        percentage: 100
      });

      return {
        data: finalData,
        metadata,
        decrypted,
        fileSize: finalData.length,
        outputPath: options?.outputPath
      };
    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
  }

  /**
   * List files (implementation depends on external service)
   */
  public async list(): Promise<FileEntry[]> {
    // This would need to be implemented with a proper indexing service
    // For now, return empty array
    console.warn('List functionality requires an external indexing service');
    return [];
  }

  /**
   * Share a file with another user
   */
  public async share(dataIdentifier: string, options: ShareOptions): Promise<void> {
    try {
      validateDataIdentifier(dataIdentifier);
      validateAddress(options.recipient);
      
      if (!this.contracts) {
        throw createValidationError('Contracts not configured', {
          userMessage: 'SDK was not initialized with smart contract configuration'
        });
      }

      await this.contracts.shareFile(
        dataIdentifier,
        options.recipient,
        1,
        this.synapse.getSigner()
      );
    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
  }

  /**
   * Make a file public (anyone can decrypt)
   */
  public async makePublic(dataIdentifier: string): Promise<void> {
    try {
      validateDataIdentifier(dataIdentifier);
      
      if (!this.contracts) {
        throw createValidationError('Contracts not configured', {
          userMessage: 'SDK was not initialized with smart contract configuration'
        });
      }

      // Get file contract address
      const provider = this.synapse.getProvider();
      const fileContractAddress = await this.contracts.getFileContractAddress(
        dataIdentifier,
        provider
      );

      if (!fileContractAddress) {
        throw createValidationError('File contract not found', {
          userMessage: 'Could not find smart contract for this file'
        });
      }

      await this.contracts.makePublic(fileContractAddress, this.synapse.getSigner());
    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
  }

  /**
   * Make a file private (NFT required for access)
   */
  public async makePrivate(dataIdentifier: string): Promise<void> {
    try {
      validateDataIdentifier(dataIdentifier);
      
      if (!this.contracts) {
        throw createValidationError('Contracts not configured', {
          userMessage: 'SDK was not initialized with smart contract configuration'
        });
      }

      // Get file contract address
      const provider = this.synapse.getProvider();
      const fileContractAddress = await this.contracts.getFileContractAddress(
        dataIdentifier,
        provider
      );

      if (!fileContractAddress) {
        throw createValidationError('File contract not found', {
          userMessage: 'Could not find smart contract for this file'
        });
      }

      await this.contracts.makePrivate(fileContractAddress, this.synapse.getSigner());
    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
  }

  /**
   * Delete a file (revoke all permissions)
   */
  public async delete(pieceCid: string): Promise<void> {
    // Note: Actual deletion from Filecoin is not possible
    // This would revoke access permissions only
    console.warn('Delete functionality would revoke permissions but file remains on Filecoin');
    validatePieceCid(pieceCid);
  }

  /**
   * Check wallet and Synapse balances
   */
  public async checkBalance(): Promise<BalanceInfo> {
    try {
      return await this.storage.checkBalances();
    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
  }

  /**
   * Deposit USDFC to Synapse
   */
  public async deposit(amount: number): Promise<void> {
    try {
      await this.storage.deposit(amount);
    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
  }

  /**
   * Clean up SDK resources
   */
  public async cleanup(): Promise<void> {
    if (this.encryption) {
      await this.encryption.cleanup();
    }
  }
}