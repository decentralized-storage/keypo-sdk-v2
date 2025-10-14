/**
 * Smart contract management for Synapse Storage SDK
 */

import { ethers, type Signer, Contract, ZeroAddress } from 'ethers';
import { PermissionsRegistryAbi, PermissionedFileAbi } from './abis.js';
import { createContractError } from '../../errors/index.js';
import type { ExtendedMetadata } from '../../types/index.js';
import { deployPermissionedData, type PermissionParameters } from './deployPermissionedData.js';
import { mintOwnerNFT } from './mintOwnerNFT.js';

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
    quantity: number = 1,
    signer: Signer
  ): Promise<void> {
    try {
      const registryContract = new Contract(
        this.config.registryAddress,
        PermissionsRegistryAbi,
        signer
      );

      const tx = await registryContract.shareFileWithUser(
        dataIdentifier,
        recipientAddress,
        quantity
      );
      await tx.wait();
    } catch (error) {
      throw createContractError('Failed to share file', {
        cause: error,
        userMessage: `Could not share file with ${recipientAddress}`
      });
    }
  }

  /**
   * Revoke file access for a user
   */
  public async revokeAccess(
    dataIdentifier: string,
    userAddress: string,
    signer: Signer
  ): Promise<void> {
    try {
      const registryContract = new Contract(
        this.config.registryAddress,
        PermissionsRegistryAbi,
        signer
      );

      const tx = await registryContract.revokePermission(
        dataIdentifier,
        userAddress
      );
      await tx.wait();
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
    signer: Signer
  ): Promise<void> {
    try {
      const fileContract = new Contract(
        fileContractAddress,
        PermissionedFileAbi,
        signer
      );

      const tx = await fileContract.makePublic();
      await tx.wait();
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
    signer: Signer
  ): Promise<void> {
    try {
      const fileContract = new Contract(
        fileContractAddress,
        PermissionedFileAbi,
        signer
      );

      const tx = await fileContract.makePrivate();
      await tx.wait();
    } catch (error) {
      throw createContractError('Failed to make file private', {
        cause: error,
        userMessage: 'Could not change file to private access'
      });
    }
  }
}