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
  BalanceInfo,
  ShareOptions,
  DeleteOptions,
  DeleteResult,
  DataMetadata,
  ExtendedMetadata,
  ListOptions,
  ListPublicOptions,
  FileListEntry
} from './types/index.js';

import { LitEncryption } from './modules/encryption/LitEncryption.js';
import { ContractManager } from './modules/contracts/ContractManager.js';
import { StorageManager } from './modules/storage/StorageManager.js';
import { validateSDKConfig, validatePieceCid, validateAddress } from './utils/validation.js';
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
        options?.callbacks,
        options?.onProgress,
        options?.serviceProvider
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
   * Share a file with another user using piece CID
   */
  public async share(pieceCid: string, options: ShareOptions): Promise<void> {
    try {
      validatePieceCid(pieceCid);
      validateAddress(options.recipient);
      
      if (!this.contracts) {
        throw createValidationError('Contracts not configured', {
          userMessage: 'SDK was not initialized with smart contract configuration'
        });
      }

      if (options.debug) {
        console.log(`[DEBUG] Sharing file with piece CID: ${pieceCid} to ${options.recipient}`);
      }

      // Step 1: Find the file by piece CID using list function
      const allFiles = await this.list({
        debug: options.debug
      });

      // Manually filter by piece CID since the filtering might not work correctly
      const matchingFiles = allFiles.filter(file => 
        file.pieceCid === pieceCid
      );

      // Check if file exists
      if (matchingFiles.length === 0) {
        throw createValidationError('File not found', {
          userMessage: `No encrypted file found with piece CID: ${pieceCid}`
        });
      }

      if (matchingFiles.length > 1) {
        if (options.debug) {
          console.warn('Multiple files found with the same piece CID. Using the first one.');
        }
      }

      const fileData = matchingFiles[0];
      
      if (options.debug) {
        console.log(`[DEBUG] File found:`, {
          name: fileData.fileName,
          dataIdentifier: fileData.dataIdentifier,
          accessType: fileData.isPublic ? 'public' : 'private',
          owner: fileData.owner
        });
      }

      // Step 2: Check if file is public
      if (fileData.isPublic) {
        throw createValidationError('File is public', {
          userMessage: 'File is public - no need to share. Anyone can already decrypt this file.'
        });
      }

      // Step 3: Get current wallet address and verify ownership
      const signer = this.synapse.getSigner();
      const currentAddress = await signer.getAddress();
      
      if (fileData.owner?.toLowerCase() !== currentAddress.toLowerCase()) {
        throw createValidationError('Permission denied', {
          userMessage: `You are not the owner of this file. Owner: ${fileData.owner}, Your address: ${currentAddress}`
        });
      }

      // Step 4: Create kernel client for smart contract operations
      if (options.debug) {
        console.log(`[DEBUG] Creating kernel client for sharing operation...`);
      }

      // Create wallet client and account with proper private key formatting
      const formattedPrivateKey = this.privateKey!.startsWith('0x') 
        ? this.privateKey 
        : `0x${this.privateKey}`;
      const account = privateKeyToAccount(formattedPrivateKey as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(this.config.rpcUrl),
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
        options.debug
      );

      // Step 5: Share the file using the dataIdentifier and kernel client
      if (options.debug) {
        console.log(`[DEBUG] Proceeding to mint access NFT for dataIdentifier: ${fileData.dataIdentifier}`);
      }

      await this.contracts.shareFile(
        fileData.dataIdentifier,
        options.recipient,
        1,
        kernelClient,
        options.debug
      );

      if (options.debug) {
        console.log(`[DEBUG] Successfully shared file ${fileData.fileName} with ${options.recipient}`);
      }
    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
  }


  /**
   * Delete a file by piece CID (removes from permissions registry)
   * Note: File data remains on Filecoin but access is revoked
   */
  public async delete(pieceCid: string, options?: DeleteOptions): Promise<DeleteResult> {
    try {
      validatePieceCid(pieceCid);
      
      if (!this.privateKey) {
        throw createValidationError('Private key required', {
          userMessage: 'Private key is required for delete operations'
        });
      }

      options?.onProgress?.({ message: 'Looking up file by piece CID...', step: 1, total: 4 });

      // Step 1: Find the file by piece CID using list function
      const files = await this.list();
      const fileData = files.find(file => file.pieceCid === pieceCid);
      
      if (!fileData) {
        throw createValidationError('File not found', {
          userMessage: `No file found with piece CID: ${pieceCid}`
        });
      }

      if (!fileData.dataIdentifier) {
        throw createValidationError('Invalid file data', {
          userMessage: 'File data is missing required data identifier'
        });
      }

      options?.onProgress?.({ message: 'Verifying ownership...', step: 2, total: 4 });

      // Step 2: Verify ownership
      const signer = this.synapse.getSigner();
      const currentAddress = await signer.getAddress();
      
      if (fileData.owner?.toLowerCase() !== currentAddress.toLowerCase()) {
        throw createValidationError('Permission denied', {
          userMessage: `You are not the owner of this file. Owner: ${fileData.owner}, Your address: ${currentAddress}`
        });
      }

      options?.onProgress?.({ message: 'Creating kernel client for deletion...', step: 3, total: 4 });

      // Step 3: Create kernel client for smart contract operations
      if (options?.debug) {
        console.log(`[DEBUG] Creating kernel client for delete operation...`);
        console.log(`[DEBUG] File to delete: ${fileData.fileName || 'Unknown'} (${fileData.dataIdentifier})`);
      }

      // Create wallet client and account with proper private key formatting
      const formattedPrivateKey = this.privateKey!.startsWith('0x') 
        ? this.privateKey 
        : `0x${this.privateKey}`;
      const account = privateKeyToAccount(formattedPrivateKey as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(this.config.rpcUrl),
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
        options?.debug
      );

      options?.onProgress?.({ message: 'Deleting file from permissions registry...', step: 4, total: 4 });

      // Step 4: Delete the file using the dataIdentifier and kernel client
      if (options?.debug) {
        console.log(`[DEBUG] Proceeding to delete file with dataIdentifier: ${fileData.dataIdentifier}`);
      }

      const transactionHash = await this.contracts!.deleteFile(
        fileData.dataIdentifier,
        kernelClient,
        options?.debug
      );

      if (options?.debug) {
        console.log(`[DEBUG] Successfully deleted file ${fileData.fileName} with transaction hash: ${transactionHash}`);
      }

      options?.onProgress?.({ message: 'File deleted successfully', step: 4, total: 4 });

      return {
        transactionHash,
        dataIdentifier: fileData.dataIdentifier,
        fileName: fileData.fileName,
        blockNumber: undefined // We could get this from receipt if needed
      };

    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
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
   * List all encrypted files for the current wallet address
   */
  public async list(options?: ListOptions): Promise<FileListEntry[]> {
    try {
      // Get wallet address
      const signer = this.synapse.getSigner();
      const address = await signer.getAddress();
      
      // Use default API URL or override if provided
      const apiUrl = options?.apiUrl || 'https://api.keypo.io';
      const pageSize = options?.filter?.pagination?.pageSize || 100;
      const maxPages = options?.filter?.pagination?.maxPages || Infinity;
      
      if (options?.debug) {
        console.log("[DEBUG] Pagination settings:", { pageSize, maxPages });
      }
      
      // Helper function to fetch a single page of data
      const fetchPage = async (skip: number, isOwner: boolean) => {
        const endpoint = isOwner ? 'filesByOwner' : 'filesByMinter';
        const url = `${apiUrl}/graph/${endpoint}?file${isOwner ? 'Owner' : 'Minter'}Address=${address}&skip=${skip}&first=${pageSize}`;
        
        if (options?.debug) {
          console.log(`[DEBUG] Fetching ${endpoint} page at skip=${skip}:`, url);
        }
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        return response.json() as Promise<any>;
      };
      
      // Helper function to check if files are deleted (batch version)
      const areFilesDeleted = async (fileIdentifiers: string[]): Promise<{ [key: string]: boolean }> => {
        const url = `${apiUrl}/graph/isDeleted?fileIdentifiers=${encodeURIComponent(JSON.stringify(fileIdentifiers))}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json() as { deletedFiles?: { [key: string]: boolean } };
        return data.deletedFiles || {};
      };
      
      // Helper function to fetch all pages for a given endpoint
      const fetchAllPages = async (isOwner: boolean) => {
        const allData: {
          permissionedFileDeployeds: Array<{
            fileIdentifier: string;
            fileMetadata: string;
            fileContractAddress: string;
            fileOwner: string;
          }>;
          permissionedFileAccessMinteds: Array<{
            fileIdentifier: string;
            fileMetadata: string;
            fileContractAddress: string;
            fileOwner: string;
          }>;
        } = { permissionedFileDeployeds: [], permissionedFileAccessMinteds: [] };
        
        let skip = 0;
        let page = 0;
        let hasMore = true;
        
        while (hasMore && page < maxPages) {
          const pageData = await fetchPage(skip, isOwner) as {
            permissionedFileDeployeds?: Array<{
              fileIdentifier: string;
              fileMetadata: string;
              fileContractAddress: string;
              fileOwner: string;
            }>;
            permissionedFileAccessMinteds?: Array<{
              fileIdentifier: string;
              fileMetadata: string;
              fileContractAddress: string;
              fileOwner: string;
            }>;
          };
          
          if (options?.debug) {
            console.log(`[DEBUG] Got ${isOwner ? 'owner' : 'minter'} page ${page + 1}:`, pageData);
          }
          
          // Add the page data to our collection
          allData.permissionedFileDeployeds = [
            ...allData.permissionedFileDeployeds,
            ...(pageData.permissionedFileDeployeds || [])
          ];
          allData.permissionedFileAccessMinteds = [
            ...allData.permissionedFileAccessMinteds,
            ...(pageData.permissionedFileAccessMinteds || [])
          ];
          
          // Check if we have more pages
          hasMore = (pageData.permissionedFileDeployeds || []).length === pageSize;
          skip += pageSize;
          page++;
          
          if (options?.debug) {
            console.log(`[DEBUG] Processed ${isOwner ? 'owner' : 'minter'} page ${page}. Has more:`, hasMore);
          }
        }
        
        return allData;
      };
      
      // Fetch both owner and minter data with pagination
      const [ownerData, minterData] = await Promise.all([
        fetchAllPages(true),
        fetchAllPages(false)
      ]);
      
      if (options?.debug) {
        console.log("[DEBUG] Total owner files:", ownerData.permissionedFileDeployeds.length);
        console.log("[DEBUG] Total minter files:", minterData.permissionedFileDeployeds.length);
        console.log("[DEBUG] Total owner access minted files:", ownerData.permissionedFileAccessMinteds.length);
        console.log("[DEBUG] Total minter access minted files:", minterData.permissionedFileAccessMinteds.length);
      }
      
      // Helper function to extract metadata fields
      const extractMetadata = (fileMetadata: any) => {
        // Check for pieceCID in filecoinStorageInfo (with both cases)
        const pieceCid = fileMetadata.filecoinStorageInfo?.pieceCID || 
                        fileMetadata.filecoinStorageInfo?.pieceCid ||
                        fileMetadata.pieceCID || 
                        fileMetadata.pieceCid;
        
        return {
          name: fileMetadata.name,
          type: fileMetadata.type,
          mimeType: fileMetadata.mimeType,
          subtype: fileMetadata.subtype,
          pieceCid: pieceCid,
          accessType: fileMetadata.accessType as 'public' | 'private' | undefined,
          userMetaData: JSON.stringify(fileMetadata) // Store the complete metadata
        };
      };
      
      // Helper function to check if file has pieceCid in filecoinStorageInfo
      const hasFilecoinStorage = (fileMetadata: any) => {
        return !!(fileMetadata.filecoinStorageInfo?.pieceCID || 
                 fileMetadata.filecoinStorageInfo?.pieceCid);
      };
      
      // Helper function to check if file has all required metadata fields
      const hasRequiredMetadata = (fileMetadata: any) => {
        // Must have pieceCid in filecoinStorageInfo ONLY
        if (!hasFilecoinStorage(fileMetadata)) return false;
        
        // Must NOT have encryptedData with ipfsHash (we don't want encrypted files)
        if (fileMetadata.encryptedData?.ipfsHash) return false;
        
        return true;
      };
      
      // Helper function to check if a file matches the filter
      const matchesFilter = (file: any) => {
        if (!options?.filter?.filterBy) return true;
        
        const fieldValue = file.dataMetadata[options.filter.filterBy.field];
        if (fieldValue === undefined) return false;
        
        switch (options.filter.filterBy.operator) {
          case 'contains':
            return String(fieldValue).toLowerCase().includes(String(options.filter.filterBy.value).toLowerCase());
          case 'startsWith':
            return String(fieldValue).toLowerCase().startsWith(String(options.filter.filterBy.value).toLowerCase());
          case 'endsWith':
            return String(fieldValue).toLowerCase().endsWith(String(options.filter.filterBy.value).toLowerCase());
          case 'equals':
          default:
            return String(fieldValue).toLowerCase() === String(options.filter.filterBy.value).toLowerCase();
        }
      };
      
      // Define internal file structure for processing
      interface InternalFileEntry {
        cid: string;
        dataContractAddress: string;
        dataIdentifier: string;
        dataMetadata: {
          name: string;
          type?: string;
          mimeType?: string;
          subtype?: string;
          pieceCid: string;
          accessType?: 'public' | 'private';
          userMetaData: string;
        };
        owner: string;
        isAccessMinted: boolean;
      }
      
      // Process all files (both deployed and access minted)
      const allFiles: { [key: string]: InternalFileEntry } = {};
      const processedFileIds = new Set<string>();
      
      // Track which files have access minted (appears in permissionedFileAccessMinteds)
      const accessMintedFileIds = new Set<string>();
      
      // First, collect all file identifiers that have access minted
      for (const file of ownerData.permissionedFileAccessMinteds || []) {
        accessMintedFileIds.add(file.fileIdentifier.toLowerCase());
      }
      for (const file of minterData.permissionedFileAccessMinteds || []) {
        accessMintedFileIds.add(file.fileIdentifier.toLowerCase());
      }
      
      // Process deployed files from owner endpoint
      for (const file of ownerData.permissionedFileDeployeds || []) {
        const dataIdentifier = file.fileIdentifier.toLowerCase();
        if (!processedFileIds.has(dataIdentifier)) {
          const fileMetadata = JSON.parse(file.fileMetadata);
          // Only process files that have all required metadata
          if (hasRequiredMetadata(fileMetadata)) {
            const fileData: InternalFileEntry = {
              cid: fileMetadata.filecoinStorageInfo?.pieceCID || fileMetadata.filecoinStorageInfo?.pieceCid || '',
              dataContractAddress: file.fileContractAddress,
              dataIdentifier: dataIdentifier,
              dataMetadata: extractMetadata(fileMetadata),
              owner: file.fileOwner,
              isAccessMinted: accessMintedFileIds.has(dataIdentifier)
            };
            
            if (matchesFilter(fileData)) {
              allFiles[dataIdentifier] = fileData;
              processedFileIds.add(dataIdentifier);
            }
          }
        }
      }
      
      // Process access minted files from owner endpoint (only if not already processed)
      for (const file of ownerData.permissionedFileAccessMinteds || []) {
        const dataIdentifier = file.fileIdentifier.toLowerCase();
        if (!processedFileIds.has(dataIdentifier)) {
          const fileMetadata = JSON.parse(file.fileMetadata);
          // Only process files that have all required metadata
          if (hasRequiredMetadata(fileMetadata)) {
            const fileData: InternalFileEntry = {
              cid: fileMetadata.filecoinStorageInfo?.pieceCID || fileMetadata.filecoinStorageInfo?.pieceCid || '',
              dataContractAddress: file.fileContractAddress,
              dataIdentifier: dataIdentifier,
              dataMetadata: extractMetadata(fileMetadata),
              owner: file.fileOwner,
              isAccessMinted: true
            };
            
            if (matchesFilter(fileData)) {
              allFiles[dataIdentifier] = fileData;
              processedFileIds.add(dataIdentifier);
            }
          }
        }
      }
      
      // Process deployed files from minter endpoint
      for (const file of minterData.permissionedFileDeployeds || []) {
        const dataIdentifier = file.fileIdentifier.toLowerCase();
        if (!processedFileIds.has(dataIdentifier)) {
          const fileMetadata = JSON.parse(file.fileMetadata);
          // Only process files that have all required metadata
          if (hasRequiredMetadata(fileMetadata)) {
            const fileData: InternalFileEntry = {
              cid: fileMetadata.filecoinStorageInfo?.pieceCID || fileMetadata.filecoinStorageInfo?.pieceCid || '',
              dataContractAddress: file.fileContractAddress,
              dataIdentifier: dataIdentifier,
              dataMetadata: extractMetadata(fileMetadata),
              owner: file.fileOwner,
              isAccessMinted: accessMintedFileIds.has(dataIdentifier)
            };
            
            if (matchesFilter(fileData)) {
              allFiles[dataIdentifier] = fileData;
              processedFileIds.add(dataIdentifier);
            }
          }
        }
      }
      
      // Process access minted files from minter endpoint (only if not already processed)
      for (const file of minterData.permissionedFileAccessMinteds || []) {
        const dataIdentifier = file.fileIdentifier.toLowerCase();
        if (!processedFileIds.has(dataIdentifier)) {
          const fileMetadata = JSON.parse(file.fileMetadata);
          // Only process files that have all required metadata
          if (hasRequiredMetadata(fileMetadata)) {
            const fileData: InternalFileEntry = {
              cid: fileMetadata.filecoinStorageInfo?.pieceCID || fileMetadata.filecoinStorageInfo?.pieceCid || '',
              dataContractAddress: file.fileContractAddress,
              dataIdentifier: dataIdentifier,
              dataMetadata: extractMetadata(fileMetadata),
              owner: file.fileOwner,
              isAccessMinted: true
            };
            
            if (matchesFilter(fileData)) {
              allFiles[dataIdentifier] = fileData;
              processedFileIds.add(dataIdentifier);
            }
          }
        }
      }
      
      // Filter out deleted files using batch request
      const finalFiles: { [key: string]: InternalFileEntry } = {};
      
      try {
        // Get all file identifiers
        const allFileIdentifiers = Object.keys(allFiles);
        
        if (options?.debug) {
          console.log(`[DEBUG] Checking deletion status for ${allFileIdentifiers.length} files`);
        }
        
        if (allFileIdentifiers.length > 0) {
          // Batch check deletion status
          const deletionStatuses = await areFilesDeleted(allFileIdentifiers);
          
          // Filter out deleted files
          Object.entries(allFiles).forEach(([dataIdentifier, fileData]) => {
            const isDeleted = deletionStatuses[dataIdentifier] || false;
            if (!isDeleted) {
              finalFiles[dataIdentifier] = fileData;
            } else if (options?.debug) {
              console.log(`[DEBUG] Filtered out deleted file: ${dataIdentifier}`);
            }
          });
          
          if (options?.debug) {
            console.log(`[DEBUG] Files after deletion filter: ${Object.keys(finalFiles).length}`);
          }
        }
        
      } catch (error) {
        console.warn('Failed to check deletion status, including all files:', error);
        // If batch deletion check fails, include all files
        Object.assign(finalFiles, allFiles);
      }
      
      // Apply sorting if specified
      let sortedFiles = finalFiles;
      if (options?.filter?.sortBy) {
        const sortBy = options.filter.sortBy;
        const sortedEntries = Object.entries(finalFiles).sort(([, a], [, b]) => {
          const aValue = (a.dataMetadata as any)[sortBy.field];
          const bValue = (b.dataMetadata as any)[sortBy.field];
          
          // Handle undefined values
          if (aValue === undefined && bValue === undefined) return 0;
          if (aValue === undefined) return sortBy.direction === 'desc' ? 1 : -1;
          if (bValue === undefined) return sortBy.direction === 'desc' ? -1 : 1;
          
          // Compare values
          const comparison = String(aValue).localeCompare(String(bValue));
          return sortBy.direction === 'desc' ? -comparison : comparison;
        });
        
        // Convert sorted entries back to object
        sortedFiles = Object.fromEntries(sortedEntries);
      }
      
      // Convert to array format matching FileListEntry interface
      const fileArray: FileListEntry[] = Object.entries(sortedFiles).map(([dataIdentifier, file]) => {
        // Parse the full metadata if available
        let fullMetadata: any = {};
        try {
          if (file.dataMetadata?.userMetaData) {
            fullMetadata = JSON.parse(file.dataMetadata.userMetaData);
          }
        } catch {
          // Ignore parsing errors
        }
        
        // Extract file size from metadata
        let fileSize: number | undefined;
        if (fullMetadata.size) {
          fileSize = fullMetadata.size;
        } else if (fullMetadata.fileSize) {
          fileSize = fullMetadata.fileSize;
        }
        
        // Extract upload timestamp
        let uploadedAt: string | undefined;
        if (fullMetadata.filecoinStorageInfo?.uploadTimestamp) {
          uploadedAt = fullMetadata.filecoinStorageInfo.uploadTimestamp;
        } else if (fullMetadata.uploadTimestamp) {
          uploadedAt = fullMetadata.uploadTimestamp;
        }
        
        return {
          fileName: file.dataMetadata?.name || 'Unknown',
          pieceCid: file.dataMetadata?.pieceCid || file.cid || '',
          dataIdentifier: dataIdentifier,
          fileSize: fileSize,
          isPublic: file.dataMetadata?.accessType === 'public',
          encrypted: true, // All files in this SDK are encrypted
          uploadedAt: uploadedAt,
          contractAddress: file.dataContractAddress,
          owner: file.owner,
          isAccessMinted: file.isAccessMinted,
          shares: [], // Would need additional API calls to get share info
          status: 'active', // Default status
          metadata: fullMetadata
        };
      });
      
      if (options?.debug) {
        console.log("[DEBUG] Final file array:", fileArray);
      }
      
      return fileArray;
      
    } catch (error) {
      throw ErrorHandler.normalize(error);
    }
  }

  /**
   * List all public encrypted files from all users
   */
  public async listPublic(options?: ListPublicOptions): Promise<FileListEntry[]> {
    try {
      // Use default API URL or override if provided
      const apiUrl = options?.apiUrl || 'https://api.keypo.io';
      const limit = options?.limit || 1000;
      
      if (options?.debug) {
        console.log("[DEBUG] ListPublic settings:", { apiUrl, limit });
      }
      
      // Fetch all files from all users (no address filter)
      const allFiles: Record<string, any> = {};
      const deletedFileIds = new Set<string>();
      let skip = 0;
      const batchSize = 100;
      let hasMore = true;
      
      while (hasMore && skip < limit) {
        try {
          const currentBatch = Math.min(batchSize, limit - skip);
          const url = `${apiUrl}/graph/filesByOwner?skip=${skip}&first=${currentBatch}`;
          
          if (options?.debug) {
            console.log(`[DEBUG] Fetching public files batch at skip=${skip}:`, url);
          }
          
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (!response.ok) {
            throw new Error(`API request failed: ${response.statusText}`);
          }
          
          const data = await response.json() as {
            permissionedFileDeployeds?: Array<{
              fileIdentifier: string;
              fileMetadata: string;
              fileContractAddress: string;
              fileOwner: string;
            }>;
            permissionedFileDeleteds?: Array<{
              fileIdentifier: string;
            }>;
          };
          
          const { permissionedFileDeployeds = [], permissionedFileDeleteds = [] } = data;
          
          // Check if we got any results
          if (permissionedFileDeployeds.length === 0) {
            hasMore = false;
            break;
          }
          
          // Collect deleted file IDs
          for (const deleted of permissionedFileDeleteds) {
            deletedFileIds.add(deleted.fileIdentifier);
          }
          
          // Process deployed files
          for (const file of permissionedFileDeployeds) {
            // Skip if this file has been deleted
            if (deletedFileIds.has(file.fileIdentifier)) {
              continue;
            }
            
            try {
              const metadata = JSON.parse(file.fileMetadata || '{}');
              
              // Extract piece CID from nested structure
              const pieceCid = metadata.filecoinStorageInfo?.pieceCid || 
                             metadata.filecoinStorageInfo?.pieceCID ||
                             metadata.pieceCid || 
                             metadata.cid;
              
              // Only include files with Filecoin storage info (like the CLI does)
              if (metadata.filecoinStorageInfo?.pieceCid || metadata.filecoinStorageInfo?.pieceCID) {
                // Create file entry
                allFiles[file.fileIdentifier] = {
                  dataMetadata: metadata,
                  dataContractAddress: file.fileContractAddress,
                  owner: file.fileOwner,
                  isAccessMinted: false, // We don't have this info from this endpoint
                  cid: pieceCid
                };
              }
            } catch (e) {
              // Skip files with invalid metadata
              if (options?.debug) {
                console.warn(`Skipping file with invalid metadata: ${file.fileIdentifier}`);
              }
            }
          }
          
          skip += currentBatch;
          
          if (options?.debug) {
            console.log(`[DEBUG] Processed public files batch. Total so far: ${Object.keys(allFiles).length}`);
          }
        } catch (error) {
          if (options?.debug) {
            console.error(`Error fetching batch at skip=${skip}:`, error);
          }
          break;
        }
      }
      
      // Final cleanup: remove any files that were marked as deleted
      for (const deletedId of deletedFileIds) {
        delete allFiles[deletedId];
      }
      
      if (options?.debug) {
        console.log(`[DEBUG] Total files after cleanup: ${Object.keys(allFiles).length}`);
      }
      
      // Filter for public files only
      const publicFiles = Object.entries(allFiles).filter(([, file]) => {
        return file.dataMetadata?.accessType === 'public';
      });
      
      if (options?.debug) {
        console.log(`[DEBUG] Public files found: ${publicFiles.length}`);
      }
      
      // Convert to FileListEntry format
      const fileArray: FileListEntry[] = publicFiles.map(([dataIdentifier, file]) => {
        // Parse the full metadata if available
        const metadata = file.dataMetadata || {};
        
        // Extract file size from metadata
        let fileSize: number | undefined;
        if (metadata.size) {
          fileSize = metadata.size;
        } else if (metadata.fileSize) {
          fileSize = metadata.fileSize;
        }
        
        // Extract upload timestamp
        let uploadedAt: string | undefined;
        if (metadata.filecoinStorageInfo?.uploadTimestamp) {
          uploadedAt = metadata.filecoinStorageInfo.uploadTimestamp;
        } else if (metadata.uploadTimestamp) {
          uploadedAt = metadata.uploadTimestamp;
        }
        
        return {
          fileName: metadata.name || 'Unknown',
          pieceCid: metadata.filecoinStorageInfo?.pieceCid || 
                   metadata.filecoinStorageInfo?.pieceCID ||
                   metadata.pieceCid || 
                   file.cid || '',
          dataIdentifier: dataIdentifier,
          fileSize: fileSize,
          isPublic: true, // All files in this result are public
          encrypted: true, // All files in this SDK are encrypted
          uploadedAt: uploadedAt,
          contractAddress: file.dataContractAddress,
          owner: file.owner,
          isAccessMinted: file.isAccessMinted,
          shares: [], // Would need additional API calls to get share info
          status: 'active', // Default status
          metadata: metadata
        };
      });
      
      if (options?.debug) {
        console.log("[DEBUG] Final public file array:", fileArray);
      }
      
      return fileArray;
      
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