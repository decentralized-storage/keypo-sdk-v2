/**
 * Smart contract management for Synapse Storage SDK
 */

import { ethers, Contract, ZeroAddress } from 'ethers';
import { encodeFunctionData } from 'viem';
import { PermissionsRegistryAbi, PermissionedFileAbi } from './abis.js';
import { createContractError } from '../../errors/index.js';
import type { ExtendedMetadata } from '../../types/index.js';
import { deployPermissionedData, type PermissionParameters } from './deployPermissionedData.js';
import { mintOwnerNFT } from './mintOwnerNFT.js';
import { RETRY_CONFIG, calculateBackoffDelay } from '../../constants/index.js';

// Re-export the interface from deployPermissionedData
export type { PermissionParameters };

export interface ContractConfig {
  registryAddress: string;
  validationAddress: string;
  bundlerRpcUrl: string;
}

export class ContractManager {
  private config: ContractConfig;

  constructor(config: ContractConfig) {
    this.config = config;
  }


  /**
   * Deploy permissioned data contract and optionally mint NFT
   */
  public async deployPermissionsAndMintNFT(
    dataIdentifier: string,
    metadata: ExtendedMetadata,
    kernelClient: any,
    userAddress: string,
    isPublic: boolean = false,
    debug?: boolean
  ): Promise<string> {
    try {
      // Create custom parameters based on public/private access
      const customParameters: PermissionParameters[] = [{
        permissionType: 0,
        permissionAddress: userAddress,
        tokenQuantity: isPublic ? 0 : 1, // 0 for public (anyone can access), 1 for private (NFT required)
        timeLimitBlockNumber: 0,
        operator: 0,
      }];

      // Deploy the permissioned data
      if (debug) {
        console.log(`🚀 Deploying ${isPublic ? 'public' : 'private'} permission contract...`);
      }
      
      const deployTxHash = await deployPermissionedData(
        dataIdentifier,
        JSON.stringify(metadata),
        kernelClient,
        userAddress,
        this.config.registryAddress,
        this.config.validationAddress,
        PermissionsRegistryAbi,
        customParameters,
        debug
      );
      
      if (debug) {
        console.log('✅ Permission contract deployed');
      }

      // Only mint NFT for private files
      if (!isPublic) {
        if (debug) {
          console.log('🎫 Minting owner NFT...');
        }
        
        await mintOwnerNFT(
          kernelClient,
          this.config.registryAddress,
          dataIdentifier,
          PermissionsRegistryAbi,
          debug
        );
        
        if (debug) {
          console.log('✅ Owner NFT minted');
        }
      } else if (debug) {
        console.log('📢 Public file - no NFT needed (anyone can decrypt)');
      }

      return deployTxHash;
    } catch (error) {
      if (debug) {
        console.error('❌ Smart contract operation failed:', error);
      }
      throw error; // Re-throw so caller can handle appropriately
    }
  }

  /**
   * Mint NFT for file owner
   */
  public async mintOwnerNFT(
    dataIdentifier: string,
    kernelClient: any
  ): Promise<void> {
    try {
      const registryContract = new Contract(
        this.config.registryAddress,
        PermissionsRegistryAbi,
        kernelClient
      );

      const tx = await registryContract.mintFileNFT(dataIdentifier, 1);
      await tx.wait();
    } catch (error) {
      throw createContractError('Failed to mint owner NFT', {
        cause: error,
        userMessage: 'Could not mint NFT for file ownership'
      });
    }
  }

  /**
   * Share file with another user
   */
  public async shareFile(
    dataIdentifier: string,
    recipientAddress: string,
    _quantity: number = 1,  // Keep for backward compatibility but not used
    kernelClient: any,  // ZeroDev kernel client for account abstraction
    debug: boolean = false
  ): Promise<void> {
    try {
      if (debug) {
        console.log(`[DEBUG] ShareFile - Registry Contract: ${this.config.registryAddress}`);
        console.log(`[DEBUG] ShareFile - Data Identifier: ${dataIdentifier}`);
        console.log(`[DEBUG] ShareFile - Recipient: ${recipientAddress}`);
        console.log(`[DEBUG] ShareFile - Kernel Client Address: ${kernelClient.account.address}`);
      }

      // Encode the function data using viem
      const txData = encodeFunctionData({
        abi: PermissionsRegistryAbi as any,
        functionName: "mintFromPermissionedFileForOwner",
        args: [dataIdentifier, [recipientAddress]]  // Function expects array of addresses
      });

      if (debug) {
        console.log(`[DEBUG] ShareFile - Encoded transaction data: ${txData}`);
      }

      // Retry logic similar to mintOwnerNFT
      const retryAttempts = RETRY_CONFIG.DEFAULT_ATTEMPTS;
      const retryDelay = RETRY_CONFIG.BASE_DELAY_MS;
      let lastError: any;

      for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        try {
          if (debug && attempt > 1) {
            console.log(`[DEBUG] ShareFile - Retry attempt ${attempt}/${retryAttempts}`);
          }

          // Add exponential backoff delay between retry attempts
          if (attempt > 1) {
            const backoffDelay = calculateBackoffDelay(attempt - 1, retryDelay);
            if (debug) {
              console.log(`[DEBUG] ShareFile - Waiting ${backoffDelay}ms before retry attempt ${attempt}`);
            }
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }

          // Prepare the user operation
          const userOperation = {
            callData: await kernelClient.account.encodeCalls([{
              to: this.config.registryAddress as `0x${string}`,
              value: BigInt(0),
              data: txData,
            }]),
            maxFeePerGas: undefined, // Let the bundler estimate
            maxPriorityFeePerGas: undefined, // Let the bundler estimate
          };

          if (debug) {
            console.log(`[DEBUG] ShareFile - Sending user operation with callData: ${userOperation.callData}`);
          }

          // Send user operation with timeout
          const userOpHash = await Promise.race([
            kernelClient.sendUserOperation(userOperation),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout: ShareFile sendUserOperation took too long')), 30000)
            )
          ]);

          if (debug) {
            console.log(`[DEBUG] ShareFile - User operation hash: ${userOpHash}`);
            console.log(`[DEBUG] ShareFile - Waiting for confirmation...`);
          }

          // Wait for receipt with timeout
          const { receipt } = await Promise.race([
            kernelClient.waitForUserOperationReceipt({
              hash: userOpHash,
            }),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout: ShareFile waitForUserOperationReceipt took too long')), 60000)
            )
          ]);

          if (debug) {
            console.log(`[DEBUG] ShareFile - Transaction confirmed in block: ${receipt.blockNumber}`);
            console.log(`[DEBUG] ShareFile - Gas used: ${receipt.gasUsed?.toString()}`);
            console.log(`[DEBUG] ShareFile - Transaction hash: ${receipt.transactionHash}`);
            console.log(`[DEBUG] ShareFile - Successful on attempt ${attempt}`);
          }

          // Success - exit retry loop
          return;

        } catch (error: any) {
          lastError = error;
          console.error(`[DEBUG] ShareFile - Error on attempt ${attempt}/${retryAttempts}:`, error.message);
          
          // Check for specific error types
          if (error.message && error.message.includes("UserOperation reverted during simulation")) {
            console.error("[DEBUG] ShareFile - UserOperation simulation failed - this could be due to:");
            console.error("1. Insufficient permissions - user may not own this file");
            console.error("2. Invalid recipient address");
            console.error("3. File may not exist or be accessible");
            console.error("4. Network congestion or gas estimation issues");
          }
          
          // If this is not the last attempt, continue to retry
          if (attempt < retryAttempts) {
            if (debug) {
              console.log(`[DEBUG] ShareFile - Will retry in ${retryDelay}ms...`);
            }
            continue;
          }
          
          // If all attempts failed, break and throw error
          break;
        }
      }

      // If we get here, all attempts failed
      throw lastError;
    } catch (error: any) {
      // Extract detailed error information
      let errorDetails: any = {
        contract: this.config.registryAddress,
        dataIdentifier,
        recipientAddress
      };

      // Add specific error details based on error type
      if (error.code) {
        errorDetails.errorCode = error.code;
      }
      if (error.reason) {
        errorDetails.reason = error.reason;
      }
      if (error.data) {
        errorDetails.contractError = error.data;
      }
      if (error.transaction) {
        errorDetails.transaction = error.transaction;
      }

      if (debug) {
        console.error(`[DEBUG] ShareFile - Error details:`, errorDetails);
        console.error(`[DEBUG] ShareFile - Full error:`, error);
      }

      throw createContractError('Failed to share file', {
        cause: error,
        userMessage: `Could not share file with ${recipientAddress}. ${error.reason || error.message || 'Unknown contract error'}`,
        details: errorDetails
      });
    }
  }

  /**
   * Revoke file access for a user
   */
  public async revokeAccess(
    dataIdentifier: string,
    userAddress: string,
    kernelClient: any  // ZeroDev kernel client for account abstraction
  ): Promise<void> {
    try {
      // Encode the function data using viem
      const txData = encodeFunctionData({
        abi: PermissionsRegistryAbi as any,
        functionName: "revokePermission",
        args: [dataIdentifier, userAddress]
      });

      // Prepare the user operation
      const userOperation = {
        callData: await kernelClient.account.encodeCalls([{
          to: this.config.registryAddress as `0x${string}`,
          value: BigInt(0),
          data: txData,
        }]),
        maxFeePerGas: undefined, // Let the bundler estimate
        maxPriorityFeePerGas: undefined, // Let the bundler estimate
      };

      // Send user operation with timeout
      const userOpHash = await Promise.race([
        kernelClient.sendUserOperation(userOperation),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: RevokeAccess sendUserOperation took too long')), 30000)
        )
      ]);

      // Wait for receipt with timeout
      await Promise.race([
        kernelClient.waitForUserOperationReceipt({
          hash: userOpHash,
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: RevokeAccess waitForUserOperationReceipt took too long')), 60000)
        )
      ]);
    } catch (error) {
      throw createContractError('Failed to revoke access', {
        cause: error,
        userMessage: `Could not revoke access for ${userAddress}`
      });
    }
  }

  /**
   * Check if a user has permission to access a file
   */
  public async checkPermission(
    dataIdentifier: string,
    userAddress: string,
    provider: ethers.Provider
  ): Promise<boolean> {
    try {
      const registryContract = new Contract(
        this.config.registryAddress,
        PermissionsRegistryAbi,
        provider
      );

      return await registryContract.checkPermission(dataIdentifier, userAddress);
    } catch (error) {
      console.warn('Failed to check permission:', error);
      return false;
    }
  }

  /**
   * Get file contract address from data identifier
   */
  public async getFileContractAddress(
    dataIdentifier: string,
    provider: ethers.Provider
  ): Promise<string | null> {
    try {
      const registryContract = new Contract(
        this.config.registryAddress,
        PermissionsRegistryAbi,
        provider
      );

      const address = await registryContract.fileIdentifierToFileContract(dataIdentifier);
      return address === ZeroAddress ? null : address;
    } catch (error) {
      console.warn('Failed to get file contract address:', error);
      return null;
    }
  }

  /**
   * Make a file public (anyone can access)
   */
  public async makePublic(
    fileContractAddress: string,
    kernelClient: any  // ZeroDev kernel client for account abstraction
  ): Promise<void> {
    try {
      // Encode the function data using viem
      const txData = encodeFunctionData({
        abi: PermissionedFileAbi as any,
        functionName: "makePublic",
        args: []
      });

      // Prepare the user operation
      const userOperation = {
        callData: await kernelClient.account.encodeCalls([{
          to: fileContractAddress as `0x${string}`,
          value: BigInt(0),
          data: txData,
        }]),
        maxFeePerGas: undefined, // Let the bundler estimate
        maxPriorityFeePerGas: undefined, // Let the bundler estimate
      };

      // Send user operation with timeout
      const userOpHash = await Promise.race([
        kernelClient.sendUserOperation(userOperation),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: MakePublic sendUserOperation took too long')), 30000)
        )
      ]);

      // Wait for receipt with timeout
      await Promise.race([
        kernelClient.waitForUserOperationReceipt({
          hash: userOpHash,
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: MakePublic waitForUserOperationReceipt took too long')), 60000)
        )
      ]);
    } catch (error) {
      throw createContractError('Failed to make file public', {
        cause: error,
        userMessage: 'Could not change file to public access'
      });
    }
  }

  /**
   * Make a file private (NFT required for access)
   */
  public async makePrivate(
    fileContractAddress: string,
    kernelClient: any  // ZeroDev kernel client for account abstraction
  ): Promise<void> {
    try {
      // Encode the function data using viem
      const txData = encodeFunctionData({
        abi: PermissionedFileAbi as any,
        functionName: "makePrivate",
        args: []
      });

      // Prepare the user operation
      const userOperation = {
        callData: await kernelClient.account.encodeCalls([{
          to: fileContractAddress as `0x${string}`,
          value: BigInt(0),
          data: txData,
        }]),
        maxFeePerGas: undefined, // Let the bundler estimate
        maxPriorityFeePerGas: undefined, // Let the bundler estimate
      };

      // Send user operation with timeout
      const userOpHash = await Promise.race([
        kernelClient.sendUserOperation(userOperation),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: MakePrivate sendUserOperation took too long')), 30000)
        )
      ]);

      // Wait for receipt with timeout
      await Promise.race([
        kernelClient.waitForUserOperationReceipt({
          hash: userOpHash,
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: MakePrivate waitForUserOperationReceipt took too long')), 60000)
        )
      ]);
    } catch (error) {
      throw createContractError('Failed to make file private', {
        cause: error,
        userMessage: 'Could not change file to private access'
      });
    }
  }
}