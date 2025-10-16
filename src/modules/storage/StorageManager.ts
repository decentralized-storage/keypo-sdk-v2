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
  BalanceInfo
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
}

export class StorageManager {
  private synapse: Synapse;
  private config: StorageConfig;
  
  constructor(synapse: Synapse, config: Partial<StorageConfig> = {}) {
    this.synapse = synapse;
    this.config = {
      capacityGB: config.capacityGB || STORAGE_DEFAULTS.CAPACITY_GB,
      persistenceDays: config.persistenceDays || STORAGE_DEFAULTS.PERSISTENCE_DAYS,
      withCDN: config.withCDN ?? STORAGE_DEFAULTS.WITH_CDN
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
   * Upload data to Filecoin
   */
  public async upload(
    data: Uint8Array,
    _callbacks?: StorageCallbacks,
    onProgress?: (status: UploadProgress) => void
  ): Promise<{ pieceCid: any; datasetCreated: boolean }> {
    try {
      // Report upload start
      onProgress?.({
        stage: 'uploading',
        message: 'Initializing storage service...',
        percentage: 0
      });

      let datasetCreated = false;
      
      // Create storage service (no parameters, just like synapse-cli)
      const storageService = await this.synapse.createStorage();

      // Upload the data
      onProgress?.({
        stage: 'uploading',
        message: 'Uploading to storage provider...',
        percentage: 60
      });

      const { pieceCid } = await storageService.upload(data);

      return { pieceCid, datasetCreated };
    } catch (error) {
      throw createStorageError('Upload failed', {
        cause: error,
        userMessage: 'Could not upload file to Filecoin'
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