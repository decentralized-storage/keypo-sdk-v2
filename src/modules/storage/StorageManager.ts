/**
 * Storage operations manager for Synapse Storage SDK
 */

import type { Synapse } from '@filoz/synapse-sdk';
import { TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import type { 
  StorageCallbacks, 
  UploadProgress,
  DownloadProgress,
  BalanceInfo,
  ProofsetInfo
} from '../../types/index.js';
import { 
  TOKEN_AMOUNTS, 
  BALANCE_THRESHOLDS,
  STORAGE_DEFAULTS,
  formatUSDFC
} from '../../constants/index.js';
import { createStorageError, createPaymentError } from '../../errors/index.js';

export interface StorageConfig {
  capacityGB: number;
  persistenceDays: number;
  withCDN: boolean;
  minDaysThreshold: number;
}

export class StorageManager {
  private synapse: Synapse;
  private config: StorageConfig;
  
  constructor(synapse: Synapse, config: Partial<StorageConfig> = {}) {
    this.synapse = synapse;
    this.config = {
      capacityGB: config.capacityGB || STORAGE_DEFAULTS.CAPACITY_GB,
      persistenceDays: config.persistenceDays || STORAGE_DEFAULTS.PERSISTENCE_DAYS,
      withCDN: config.withCDN ?? STORAGE_DEFAULTS.WITH_CDN,
      minDaysThreshold: config.minDaysThreshold || STORAGE_DEFAULTS.MIN_DAYS_THRESHOLD
    };
  }

  /**
   * Check wallet and Synapse balances
   */
  public async checkBalances(): Promise<BalanceInfo> {
    try {
      const [filBalance, usdfcBalance, synapseBalance] = await Promise.all([
        this.synapse.getProvider().getBalance(await this.synapse.getSigner().getAddress()),
        this.synapse.payments.walletBalance(TOKENS.USDFC),
        this.synapse.payments.balance(TOKENS.USDFC)
      ]);

      return {
        filBalance,
        usdfcBalance,
        synapseBalance,
        formatted: {
          fil: ethers.formatEther(filBalance),
          usdfc: formatUSDFC(usdfcBalance).toString(),
          synapse: formatUSDFC(synapseBalance).toString()
        }
      };
    } catch (error) {
      throw createStorageError('Failed to check balances', {
        cause: error,
        userMessage: 'Could not retrieve wallet balances'
      });
    }
  }

  /**
   * Validate and prepare payment for upload
   */
  public async validatePayment(skipCheck: boolean = false): Promise<boolean> {
    if (skipCheck) return true;

    try {
      const address = await this.synapse.getSigner().getAddress();
      
      // Check if dataset exists
      const datasets = await this.synapse.storage.findDataSets(address);
      const hasDataset = datasets.length > 0;
      
      // Check USDFC balance
      const balance = await this.synapse.payments.walletBalance(TOKENS.USDFC);
      const balanceFormatted = formatUSDFC(balance);
      
      // Calculate minimum balance needed
      const minimumBalance = hasDataset ? 
        BALANCE_THRESHOLDS.UPLOAD_MIN_BALANCE : 
        BALANCE_THRESHOLDS.UPLOAD_MIN_BALANCE + formatUSDFC(TOKEN_AMOUNTS.DATA_SET_CREATION_FEE);
      
      if (balanceFormatted < minimumBalance) {
        throw createPaymentError(`Insufficient USDFC balance: ${balanceFormatted} USDFC`, {
          userMessage: `Insufficient balance. Need ${minimumBalance} USDFC`,
          details: { balance: balanceFormatted, required: minimumBalance, hasDataset }
        });
      }

      // Approve and deposit if needed
      const paymentsAddress = this.synapse.getPaymentsAddress();
      const allowance = await this.synapse.payments.allowance(paymentsAddress, TOKENS.USDFC);
      
      if (allowance < TOKEN_AMOUNTS.MIN_ALLOWANCE) {
        const approveTx = await this.synapse.payments.approve(
          paymentsAddress,
          ethers.MaxUint256,
          TOKENS.USDFC
        );
        await approveTx.wait();
      }

      const synapseBalance = await this.synapse.payments.balance(TOKENS.USDFC);
      const minimumSynapseBalance = hasDataset ? 
        TOKEN_AMOUNTS.MIN_SYNAPSE_BALANCE : 
        TOKEN_AMOUNTS.MIN_SYNAPSE_BALANCE + TOKEN_AMOUNTS.DATA_SET_CREATION_FEE;
        
      if (synapseBalance < minimumSynapseBalance) {
        const depositAmount = hasDataset ? 
          TOKEN_AMOUNTS.DEFAULT_DEPOSIT : 
          TOKEN_AMOUNTS.DEFAULT_DEPOSIT + TOKEN_AMOUNTS.DATA_SET_CREATION_FEE;
        const depositTx = await this.synapse.payments.deposit(depositAmount, TOKENS.USDFC);
        await depositTx.wait();
      }

      // Setup storage service approval for new dataset
      if (!hasDataset) {
        // Note: Warm storage service import needs to be resolved
        // const { WarmStorageService } = await import('@filoz/synapse-sdk/warm-storage');
        
        const storageCapacityBytes = this.config.capacityGB * 1024 * 1024 * 1024;
        const epochRate = BigInt(storageCapacityBytes) / TOKEN_AMOUNTS.RATE_DIVISOR;
        const lockupAmount = epochRate * TIME_CONSTANTS.EPOCHS_PER_DAY * BigInt(this.config.persistenceDays);
        const lockupAmountWithFee = lockupAmount + TOKEN_AMOUNTS.DATA_SET_CREATION_FEE;
        
        const approveTx = await this.synapse.payments.approveService(
          this.synapse.getWarmStorageAddress(),
          epochRate,
          lockupAmountWithFee,
          TIME_CONSTANTS.EPOCHS_PER_DAY * BigInt(this.config.persistenceDays)
        );
        await approveTx.wait();
      }

      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient')) {
        throw error; // Re-throw payment errors
      }
      throw createStorageError('Payment validation failed', {
        cause: error,
        userMessage: 'Could not validate payment for upload'
      });
    }
  }

  /**
   * Find optimal proofset for upload based on withCDN configuration
   */
  private async getOptimalProofset(address: string): Promise<ProofsetInfo | null> {
    try {
      // Get all client proofsets - using internal Synapse SDK methods
      const datasets = await this.synapse.storage.findDataSets(address);
      
      if (!datasets || datasets.length === 0) {
        return null; // No existing proofsets, will create new one
      }

      // Try to access the internal pandora service for more detailed proofset info
      // This mimics the example app's getProofset logic
      let detailedProofsets: any[] = [];
      
      try {
        // Access the internal pandora service if available
        const pandoraService = (this.synapse as any).pandoraService;
        if (pandoraService && pandoraService.getClientProofSetsWithDetails) {
          detailedProofsets = await pandoraService.getClientProofSetsWithDetails(address);
        }
      } catch (error) {
        console.warn('Could not access detailed proofset info, using basic dataset info');
      }

      // Filter by withCDN preference (if detailed info available)
      let filteredProofsets = detailedProofsets.length > 0 
        ? detailedProofsets.filter(p => p.withCDN === this.config.withCDN)
        : datasets;

      // Fall back to all proofsets if none match CDN preference
      if (filteredProofsets.length === 0) {
        filteredProofsets = detailedProofsets.length > 0 ? detailedProofsets : datasets;
      }

      // Find proofset with highest currentRootCount for optimal performance
      // Avoid providers with 0 roots as they might be problematic
      let optimalProofset = null;
      let maxRootCount = -1;

      for (const proofset of filteredProofsets) {
        const rootCount = proofset.currentRootCount || proofset.rootCount || 0;
        
        // Prefer proofsets with more roots (better established providers)
        if (rootCount > maxRootCount) {
          maxRootCount = rootCount;
          optimalProofset = proofset;
        }
      }

      // If no proofsets with roots found, use the first available
      if (!optimalProofset && filteredProofsets.length > 0) {
        optimalProofset = filteredProofsets[0];
        maxRootCount = 0;
      }

      if (!optimalProofset) {
        return null;
      }

      // Get provider info
      let providerId = optimalProofset.providerId || optimalProofset.id || 'unknown';
      
      try {
        // Try to get provider details if pandora service is available
        const pandoraService = (this.synapse as any).pandoraService;
        if (pandoraService && pandoraService.getProvider) {
          const providerInfo = await pandoraService.getProvider(providerId);
          if (providerInfo) {
            providerId = providerInfo.id || providerId;
          }
        }
      } catch (error) {
        console.warn('Could not get provider details');
      }

      return {
        providerId,
        proofset: optimalProofset,
        withCDN: optimalProofset.withCDN || this.config.withCDN,
        currentRootCount: maxRootCount
      };

    } catch (error) {
      console.warn('Error finding optimal proofset:', error);
      return null;
    }
  }

  /**
   * Upload data to Filecoin
   */
  public async upload(
    data: Uint8Array,
    callbacks?: StorageCallbacks,
    onProgress?: (status: UploadProgress) => void,
    serviceProvider?: {
      providerId?: number;
      providerAddress?: string;
      forceCreateDataSet?: boolean;
    }
  ): Promise<{ pieceCid: any; datasetCreated: boolean }> {
    try {
      // Report upload start
      onProgress?.({
        stage: 'uploading',
        message: 'Initializing storage service...',
        percentage: 0
      });

      let datasetCreated = false;
      const address = await this.synapse.getSigner().getAddress();

      // Step 1: Find optimal proofset
      onProgress?.({
        stage: 'uploading',
        message: 'Finding optimal storage proofset...',
        percentage: 5
      });

      const proofsetInfo = await this.getOptimalProofset(address);
      
      if (proofsetInfo) {
        // Existing proofset found
        callbacks?.onDataSetResolved?.({
          datasetId: proofsetInfo.proofset.id || 0,
          provider: proofsetInfo.providerId,
          withCDN: proofsetInfo.withCDN
        });

        callbacks?.onProviderSelected?.({
          name: proofsetInfo.providerId,
          id: proofsetInfo.providerId,
          withCDN: proofsetInfo.withCDN,
          currentRootCount: proofsetInfo.currentRootCount
        });

        onProgress?.({
          stage: 'uploading',
          message: `Existing proofset found (${proofsetInfo.currentRootCount} roots)`,
          percentage: 25
        });
      } else {
        // Will create new proofset
        onProgress?.({
          stage: 'uploading',
          message: 'No existing proofset found, will create new dataset...',
          percentage: 25
        });
        datasetCreated = true;
      }

      // Step 2: Create storage service with comprehensive callbacks
      const createStorageCallbacks = {
        // Dataset resolution callback
        onDataSetResolved: (info: any) => {
          callbacks?.onDataSetResolved?.(info);
          onProgress?.({
            stage: 'uploading',
            message: 'Existing dataset resolved and ready',
            percentage: 30
          });
        },

        // Dataset creation started callback
        onDataSetCreationStarted: (transactionResponse: any, statusUrl?: string) => {
          callbacks?.onDataSetCreationStarted?.(transactionResponse, statusUrl);
          onProgress?.({
            stage: 'uploading',
            message: 'Creating new dataset on blockchain...',
            percentage: 35
          });
          datasetCreated = true;
        },

        // Dataset creation progress callback
        onDataSetCreationProgress: (status: any) => {
          const progressStatus = {
            ...status,
            message: status.transactionSuccess 
              ? 'Dataset transaction confirmed on chain' 
              : status.serverConfirmed 
                ? `Dataset ready! (${Math.round((status.elapsedMs || 0) / 1000)}s)`
                : 'Creating dataset...'
          };

          callbacks?.onDataSetCreationProgress?.(progressStatus);
          
          if (status.transactionSuccess) {
            onProgress?.({
              stage: 'uploading',
              message: 'Dataset transaction confirmed on chain',
              percentage: 45
            });
          }
          
          if (status.serverConfirmed) {
            onProgress?.({
              stage: 'uploading',
              message: `Dataset ready! (${Math.round((status.elapsedMs || 0) / 1000)}s)`,
              percentage: 50
            });
          }
        },

        // Provider selection callback
        onProviderSelected: (provider: any) => {
          const providerInfo = {
            name: provider.name || provider.id || 'Unknown Provider',
            id: provider.id || provider.name || 'unknown',
            withCDN: this.config.withCDN,
            currentRootCount: 0
          };
          
          callbacks?.onProviderSelected?.(providerInfo);
          onProgress?.({
            stage: 'uploading',
            message: `Storage provider selected: ${providerInfo.name}`,
            percentage: 55
          });
        }
      };

      // Create storage service with callbacks and optional provider selection
      const storageServiceOptions: any = {
        callbacks: createStorageCallbacks,
        withCDN: this.config.withCDN
      };
      
      // Add provider selection if specified
      if (serviceProvider?.providerId) {
        storageServiceOptions.providerId = serviceProvider.providerId;
        onProgress?.({
          stage: 'uploading',
          message: `Using specified service provider: ${serviceProvider.providerId}`,
          percentage: 28
        });
      }
      
      if (serviceProvider?.providerAddress) {
        storageServiceOptions.providerAddress = serviceProvider.providerAddress;
      }
      
      if (serviceProvider?.forceCreateDataSet) {
        storageServiceOptions.forceCreateDataSet = serviceProvider.forceCreateDataSet;
        datasetCreated = true;
      }
      
      const storageService = await this.synapse.createStorage(storageServiceOptions);

      // Step 3: Upload the data with upload-specific callbacks
      onProgress?.({
        stage: 'uploading',
        message: 'Uploading file to storage provider...',
        percentage: 60
      });

      const uploadCallbacks = {
        // Upload completion callback
        onUploadComplete: (piece: any) => {
          callbacks?.onUploadComplete?.(piece);
          onProgress?.({
            stage: 'uploading',
            message: 'File uploaded! Adding pieces to dataset...',
            percentage: 80
          });
        },

        // Piece addition callback
        onPieceAdded: (transactionResponse: any) => {
          callbacks?.onPieceAdded?.(transactionResponse);
          onProgress?.({
            stage: 'uploading',
            message: transactionResponse 
              ? `Waiting for confirmation (tx: ${transactionResponse.hash?.slice(0, 8)}...)`
              : 'Waiting for transaction confirmation...',
            percentage: 90
          });
        },

        // Piece confirmation callback
        onPieceConfirmed: () => {
          callbacks?.onPieceConfirmed?.();
          onProgress?.({
            stage: 'uploading',
            message: 'Data pieces added to dataset successfully',
            percentage: 95
          });
        }
      };

      const { pieceCid } = await storageService.upload(data, uploadCallbacks);

      onProgress?.({
        stage: 'uploading',
        message: 'Upload completed successfully!',
        percentage: 100
      });

      return { pieceCid, datasetCreated };
    } catch (error) {
      // Enhanced error handling for provider-specific issues
      let errorMessage = 'Could not upload file to Filecoin';
      let debugInfo: any = {
        phase: 'unknown',
        provider: 'unknown'
      };

      if (error instanceof Error) {
        // Check for common provider issues
        if (error.message.includes('ezpdpz-calib') || error.message.includes('provider')) {
          errorMessage = 'Upload failed due to storage provider issues. Try again - you may get assigned to a different provider.';
          debugInfo.provider = 'ezpdpz-calib';
          debugInfo.phase = 'provider_upload';
        } else if (error.message.includes('timeout') || error.message.includes('network')) {
          errorMessage = 'Upload timeout - this might be a temporary provider issue. Please try again.';
          debugInfo.phase = 'network_timeout';
        } else if (error.message.includes('dataset')) {
          errorMessage = 'Dataset creation or resolution failed. Check your payment allowances.';
          debugInfo.phase = 'dataset_creation';
        } else if (error.message.includes('signature') || error.message.includes('sign')) {
          errorMessage = 'Transaction signing failed. Make sure your wallet is connected and unlocked.';
          debugInfo.phase = 'signature';
        }
      }

      console.error('Upload error details:', {
        originalError: error,
        debugInfo,
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      throw createStorageError('Upload failed', {
        cause: error,
        userMessage: errorMessage,
        details: debugInfo
      });
    }
  }

  /**
   * Download data from Filecoin
   */
  public async download(
    pieceCid: string,
    onProgress?: (status: DownloadProgress) => void
  ): Promise<Uint8Array> {
    try {
      onProgress?.({
        stage: 'fetching',
        message: 'Fetching from Filecoin...',
        percentage: 0
      });

      // Create storage service
      const storageService = await this.synapse.createStorage();
      
      onProgress?.({
        stage: 'fetching',
        message: 'Downloading file...',
        percentage: 50
      });
      
      // Download the file
      const data = await storageService.download(pieceCid);
      
      onProgress?.({
        stage: 'fetching',
        message: 'Download complete',
        percentage: 100
      });

      return new Uint8Array(data);
    } catch (error) {
      throw createStorageError('Download failed', {
        cause: error,
        userMessage: `Could not download file with CID: ${pieceCid}`
      });
    }
  }

  /**
   * Deposit USDFC to Synapse
   */
  public async deposit(amount: number): Promise<void> {
    try {
      const amountInSmallestUnit = parseUSDFC(amount.toString());
      
      // Approve spending if needed
      const paymentsAddress = this.synapse.getPaymentsAddress();
      const allowance = await this.synapse.payments.allowance(paymentsAddress, TOKENS.USDFC);
      
      if (allowance < amountInSmallestUnit) {
        const approveTx = await this.synapse.payments.approve(
          paymentsAddress,
          ethers.MaxUint256,
          TOKENS.USDFC
        );
        await approveTx.wait();
      }
      
      // Make deposit
      const depositTx = await this.synapse.payments.deposit(amountInSmallestUnit, TOKENS.USDFC);
      await depositTx.wait();
    } catch (error) {
      throw createPaymentError('Deposit failed', {
        cause: error,
        userMessage: `Could not deposit ${amount} USDFC`
      });
    }
  }
}

// Helper function for parsing USDFC amount
function parseUSDFC(amount: string): bigint {
  const numAmount = parseFloat(amount);
  return BigInt(Math.floor(numAmount * Math.pow(10, 6)));
}