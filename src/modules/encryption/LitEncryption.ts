/**
 * Lit Protocol encryption module for Synapse Storage SDK
 */

import { createLitClient } from '@lit-protocol/lit-client';
import { createAuthManager, storagePlugins } from "@lit-protocol/auth";
import { nagaTest } from '@lit-protocol/networks';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, type Account } from 'viem';
import { baseSepolia } from 'viem/chains';
import { 
  KernelVersionToAddressesMap, 
  KERNEL_V3_3 
} from '@zerodev/sdk/constants';
import type { DataMetadata, EncryptedPayload, ExtendedMetadata } from '../../types/index.js';
import { generateRandomDataIdentifier } from '../../utils/identifiers.js';
import { createEncryptionError } from '../../errors/index.js';

export interface EncryptionConfig {
  privateKey: string;
  registryAddress: string;
  validationAddress: string;
  bundlerRpcUrl: string;
}

export const TIME = {
  /** Milliseconds in one second */
  SECOND_MS: 1000,
  /** Milliseconds in one minute */
  MINUTE_MS: 60 * 1000,
  /** Milliseconds in one hour */
  HOUR_MS: 60 * 60 * 1000,
  /** Milliseconds in one day */
  DAY_MS: 24 * 60 * 60 * 1000,
  /** Timestamp conversion factor (seconds to milliseconds) */
  TIMESTAMP_TO_MS: 1000,
} as const;

export const AUTH_EXPIRATION = {
  /** Default auth expiration time (24 hours in milliseconds) */
  DEFAULT_MS: TIME.DAY_MS,
} as const;

export class LitEncryption {
  private config: EncryptionConfig;
  private litClient: any = null;
  private account: Account | null = null;
  private authManager: any = null;

  constructor(config: EncryptionConfig) {
    this.config = config;
    // Initialize auth manager once for shared usage
    this.authManager = createAuthManager({
      storage: storagePlugins.localStorageNode({
        appName: 'synapse-cli',
        networkName: 'naga-test',
        storagePath: './lit-auth-local',
      }),
    });
  }

  /**
   * Initialize Lit Protocol client
   */
  private async initializeLitClient() {
    if (this.litClient) return this.litClient;
    
    try {
      this.litClient = await createLitClient({
        network: nagaTest,
      });
      return this.litClient;
    } catch (error) {
      throw createEncryptionError('Failed to initialize Lit Protocol client', {
        cause: error,
        userMessage: 'Could not connect to Lit Protocol network'
      });
    }
  }

  /**
   * Get or create account from private key
   */
  private getAccount(): Account {
    if (this.account) return this.account;
    
    const formattedPrivateKey = this.config.privateKey.startsWith('0x') 
      ? this.config.privateKey 
      : `0x${this.config.privateKey}`;
    
    this.account = privateKeyToAccount(formattedPrivateKey as `0x${string}`);
    return this.account;
  }

  /**
   * Create authentication context for Lit Protocol operations
   */
  private async createAuthContext(litClient: any, operation: 'encryption' | 'decryption') {
    return await this.authManager.createEoaAuthContext({
      config: {
        account: this.getAccount() as any,
      },
      authConfig: {
        domain: 'localhost',
        statement: `Synapse Storage SDK ${operation}`,
        expiration: new Date(Date.now() + AUTH_EXPIRATION.DEFAULT_MS).toISOString(),
        resources: [
          ['access-control-condition-decryption', '*'],
          ['lit-action-execution', '*'],
        ],
      },
      litClient,
    });
  }

  /**
   * Create access control conditions for the encrypted data
   */
  private createAccessControlConditions(dataIdentifier: string) {
    return [{
      contractAddress: this.config.registryAddress,
      functionName: "checkPermission",
      functionParams: [dataIdentifier, ":userAddress"],
      functionAbi: {
        type: "function" as const,
        stateMutability: "view" as const,
        outputs: [
          {
            type: "bool" as const,
            name: "",
            internalType: "bool" as const,
          },
        ],
        name: "checkPermission",
        inputs: [
          {
            type: "string" as const,
            name: "fileIdentifier",
            internalType: "string" as const,
          },
          {
            type: "address" as const,
            name: "requestAddress",
            internalType: "address" as const,
          },
        ],
      },
      chain: "baseSepolia" as const,
      conditionType: "evmContract" as const,
      returnValueTest: {
        key: "",
        comparator: "=" as const,
        value: "true",
      },
    }];
  }

  /**
   * Encrypt data with Lit Protocol
   */
  public async encrypt(
    data: Uint8Array, 
    metadata: DataMetadata
  ): Promise<EncryptedPayload> {
    try {
      // Initialize Lit client
      const litClient = await this.initializeLitClient();
      
      // Get account
      const account = this.getAccount();
      
      // Generate unique data identifier
      const dataIdentifier = generateRandomDataIdentifier(data);
      
      // Create access control conditions
      const accessControlConditions = this.createAccessControlConditions(dataIdentifier);
      
      // Create authentication context for encryption
      const authContext = await this.createAuthContext(litClient, 'encryption');
      
      // Encrypt the data
      const encryptedData = await litClient.encrypt({
        dataToEncrypt: data,
        unifiedAccessControlConditions: accessControlConditions,
        chain: 'baseSepolia',
        authContext: authContext,
      });
      
      // Create wallet client for signing
      const walletClient = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(),
      });

      // Get kernel authorization for smart contract operations
      const kernelVersion = KERNEL_V3_3;
      const kernelAddresses = KernelVersionToAddressesMap[kernelVersion];
      const accountImplementationAddress = kernelAddresses.accountImplementationAddress;
      
      const authorization = await walletClient.signAuthorization({
        contractAddress: accountImplementationAddress as `0x${string}`,
        account,
      });
      
      // Return encrypted payload with all necessary data
      return {
        ciphertext: encryptedData.ciphertext,
        dataToEncryptHash: encryptedData.dataToEncryptHash,
        accessControlConditions,
        metadata: metadata as ExtendedMetadata,
        dataIdentifier,
        smartContractData: {
          kernelClient: { authorization, account }, // Simplified for now
          userAddress: account.address,
          registryContractAddress: this.config.registryAddress,
          validationContractAddress: this.config.validationAddress,
        }
      };
    } catch (error) {
      throw createEncryptionError('Encryption failed', {
        cause: error,
        userMessage: 'Failed to encrypt data with Lit Protocol'
      });
    }
  }

  /**
   * Decrypt data with Lit Protocol
   */
  public async decrypt(
    encryptedPayload: EncryptedPayload
  ): Promise<Uint8Array> {
    try {
      // Initialize Lit client
      const litClient = await this.initializeLitClient();

      // Get access control conditions
      const accs = encryptedPayload.accessControlConditions;
      
      // Create authentication context for decryption
      const authContext = await this.createAuthContext(litClient, 'decryption');
      
      // Prepare encrypted data for decryption
      const encryptedData = {
        ciphertext: encryptedPayload.ciphertext,
        dataToEncryptHash: encryptedPayload.dataToEncryptHash,
      };

      // Perform decryption
      const decryptedResponse = await litClient.decrypt({
        data: encryptedData,
        unifiedAccessControlConditions: accs,
        authContext: authContext,
        chain: 'baseSepolia',
      });

      return decryptedResponse.decryptedData as Uint8Array;
    } catch (error) {
      throw createEncryptionError('Decryption failed', {
        cause: error,
        userMessage: 'Failed to decrypt data. You may not have permission to access this file.'
      });
    }
  }

  /**
   * Clean up resources
   */
  public async cleanup() {
    if (this.litClient) {
      try {
        await this.litClient.disconnect();
      } catch (error) {
        console.warn('Failed to disconnect Lit client:', error);
      }
      this.litClient = null;
    }
  }
}