/**
 * Type definitions for the Synapse Storage SDK
 */

import type { Synapse } from '@filoz/synapse-sdk';
import type { WalletClient, Account } from 'viem';

// ============================================================================
// SDK Configuration Types
// ============================================================================

export interface SDKConfig {
  /** Network configuration */
  network: 'mainnet' | 'calibration';
  
  /** Optional custom RPC URL */
  rpcUrl?: string;
  
  /** Encryption configuration (optional) */
  encryption?: {
    registryAddress: string;
    validationAddress: string;
    bundlerRpcUrl: string;
  };
  
  /** Storage configuration */
  storage?: {
    capacityGB?: number;
    persistenceDays?: number;
    withCDN?: boolean;
    minDaysThreshold?: number;
  };
}

// ============================================================================
// Data Types
// ============================================================================

export interface DataMetadata {
  name: string;           // Human-readable name for the data
  type: string;           // The detected type of the input data
  mimeType?: string;      // The detected MIME type (present for File/Blob inputs)
  subtype?: string;       // Additional type information (e.g., 'bigint', 'base64', 'json')
  arrayType?: string;     // For TypedArrays, specifies the specific array type
  userMetaData?: any;     // Any custom metadata provided during preprocessing
}

export interface FilecoinStorageInfo {
  pieceCid: string;
  uploadTimestamp: string;
  datasetCreated: boolean;
}

export interface ExtendedMetadata extends DataMetadata {
  filecoinStorageInfo?: FilecoinStorageInfo;
  accessType?: 'public' | 'private';
}

// ============================================================================
// Operation Types
// ============================================================================

export interface UploadOptions {
  /** File name for the upload */
  fileName?: string;
  
  /** Whether the file should be publicly accessible (default: true) */
  isPublic?: boolean;
  
  /** Skip payment validation checks */
  skipPaymentCheck?: boolean;
  
  /** Custom metadata to attach to the upload */
  metadata?: Record<string, any>;
  
  /** Progress callback for upload status updates */
  onProgress?: (status: UploadProgress) => void;
}

export interface UploadProgress {
  stage: 'preparing' | 'encrypting' | 'uploading' | 'finalizing' | 'deploying-contracts';
  message: string;
  percentage?: number;
}

export interface UploadResult {
  /** Piece CID of the uploaded file */
  pieceCid: string;
  
  /** Data identifier (for encrypted files) */
  dataIdentifier?: string;
  
  /** Whether the file was encrypted */
  encrypted: boolean;
  
  /** Access type for encrypted files */
  accessType?: 'public' | 'private';
  
  /** File size in bytes */
  fileSize: number;
  
  /** File name */
  fileName: string;
  
  /** Whether a new dataset was created */
  datasetCreated: boolean;
  
  /** Transaction hash if smart contracts were deployed */
  contractTxHash?: string;
}

export interface DownloadOptions {
  /** Output path for saving the downloaded file */
  outputPath?: string;
  
  /** Whether to attempt decryption (default: true) */
  decrypt?: boolean;
  
  /** Progress callback for download status updates */
  onProgress?: (status: DownloadProgress) => void;
}

export interface DownloadProgress {
  stage: 'fetching' | 'decrypting' | 'saving';
  message: string;
  percentage?: number;
}

export interface DownloadResult {
  /** The downloaded data */
  data: Uint8Array;
  
  /** Metadata about the file */
  metadata?: DataMetadata;
  
  /** Whether the file was decrypted */
  decrypted: boolean;
  
  /** File size in bytes */
  fileSize: number;
  
  /** Output path if file was saved */
  outputPath?: string;
}

export interface ListOptions {
  /** Show detailed file information */
  detailed?: boolean;
  
  /** Filter options */
  filter?: {
    /** Filter by field */
    filterBy?: {
      field: string;
      value: string | number | boolean;
      operator?: 'equals' | 'contains' | 'startsWith' | 'endsWith';
    };
    /** Sort options */
    sortBy?: {
      field: string;
      direction?: 'asc' | 'desc';
    };
    /** Pagination options */
    pagination?: {
      pageSize?: number;
      maxPages?: number;
    };
  };
  
  /** API URL override for testing */
  apiUrl?: string;
  
  /** Enable debug output */
  debug?: boolean;
}

export interface ListPublicOptions {
  /** Show detailed file information */
  detailed?: boolean;
  
  /** API URL override for testing */
  apiUrl?: string;
  
  /** Maximum number of files to fetch (default: 1000) */
  limit?: number;
  
  /** Enable debug output */
  debug?: boolean;
}

export interface FileListEntry {
  /** File name */
  fileName: string;
  
  /** Piece CID */
  pieceCid: string;
  
  /** Data identifier */
  dataIdentifier: string;
  
  /** File size in bytes */
  fileSize?: number;
  
  /** Whether the file is public */
  isPublic: boolean;
  
  /** Whether the file is encrypted */
  encrypted: boolean;
  
  /** Upload timestamp */
  uploadedAt?: string;
  
  /** Contract address for the file */
  contractAddress?: string;
  
  /** File owner address */
  owner: string;
  
  /** Whether access NFT has been minted */
  isAccessMinted?: boolean;
  
  /** Shared with users */
  shares?: string[];
  
  /** File status */
  status?: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface BalanceInfo {
  /** Wallet FIL balance */
  filBalance: bigint;
  
  /** Wallet USDFC balance */
  usdfcBalance: bigint;
  
  /** Synapse USDFC balance */
  synapseBalance: bigint;
  
  /** Formatted balances for display */
  formatted: {
    fil: string;
    usdfc: string;
    synapse: string;
  };
}

export interface ShareOptions {
  /** Address to share with */
  recipient: string;
  
  /** Optional expiration date */
  expiresAt?: Date;
  
  /** Permission level */
  permission?: 'read' | 'write';
  
  /** Enable debug output */
  debug?: boolean;
}

export interface DeleteOptions {
  /** Enable debug output */
  debug?: boolean;
  
  /** Progress callback */
  onProgress?: (progress: { message: string; step?: number; total?: number }) => void;
}

export interface DeleteResult {
  /** Transaction hash of the delete operation */
  transactionHash: string;
  
  /** Data identifier that was deleted */
  dataIdentifier: string;
  
  /** File information that was deleted */
  fileName?: string;
  
  /** Block number where the transaction was confirmed */
  blockNumber?: number;
}

// ============================================================================
// Encryption Types
// ============================================================================

export interface EncryptedPayload {
  ciphertext: string;
  dataToEncryptHash: string;
  accessControlConditions: any[];
  metadata: ExtendedMetadata;
  dataIdentifier: string;
  smartContractData?: {
    kernelClient: any;
    userAddress: string;
    registryContractAddress: string;
    validationContractAddress: string;
  };
}

export interface DecryptAPIResponse {
  decryptedData: Uint8Array;
  metadata: DataMetadata;
}

export interface DecryptConfig {
  registryContractAddress: string;
  chain: string;
  expiration: string;
  apiUrl: string;
}

export interface DeleteConfig {
  permissionsRegistryContractAddress: string;
  bundlerRpcUrl: string;
}

export interface EncryptAPIResponse {
  name: string;
  encryptedData: {
    ipfsHash: string;
    dataIdentifier: string;
  };
}

export interface EncryptConfig {
  apiUrl: string;
  validatorAddress: string;
  registryContractAddress: string;
  bundlerRpcUrl: string;
}

export interface ShareConfig {
  permissionsRegistryContractAddress: string;
  bundlerRpcUrl: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export type TypedArray = 
  | Int8Array 
  | Uint8Array 
  | Uint8ClampedArray 
  | Int16Array 
  | Uint16Array 
  | Int32Array 
  | Uint32Array 
  | Float32Array 
  | Float64Array;

// Conditional types for browser-only APIs
export type BrowserFile = typeof File extends undefined ? never : File;
export type BrowserBlob = typeof Blob extends undefined ? never : Blob;

// ============================================================================
// Callback Types
// ============================================================================

export interface StorageCallbacks {
  onDataSetResolved?: () => void;
  onDataSetCreationStarted?: () => void;
  onDataSetCreationProgress?: (status: { transactionSuccess?: boolean; serverConfirmed?: boolean }) => void;
  onProviderSelected?: (provider: { name: string }) => void;
  onUploadComplete?: (piece: any) => void;
  onPieceAdded?: (transactionResponse: any) => void;
  onPieceConfirmed?: () => void;
}

// ============================================================================
// Error Types
// ============================================================================

export interface SDKErrorDetails {
  cause?: unknown;
  userMessage?: string;
  details?: Record<string, any>;
  code?: string;
}

// ============================================================================
// Internal Types (not exported to consumers)
// ============================================================================

export interface SynapseContext {
  synapse: Synapse;
  viem: {
    viemAccount: Account;
    viemWalletClient: WalletClient;
  };
}