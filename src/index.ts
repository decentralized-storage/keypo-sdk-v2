/**
 * Synapse Storage SDK - Main exports
 * 
 * A TypeScript SDK for encrypted file storage on Filecoin via Synapse
 */

// Main SDK class
export { SynapseStorageSDK } from './SynapseStorageSDK.js';

// Type definitions
export type {
  // Core configuration types
  SDKConfig,
  
  // Data types
  DataMetadata,
  ExtendedMetadata,
  FilecoinStorageInfo,
  
  // Operation types
  UploadOptions,
  UploadResult,
  UploadProgress,
  DownloadOptions,
  DownloadResult,
  DownloadProgress,
  ListOptions,
  ListPublicOptions,
  FileListEntry,
  BalanceInfo,
  ShareOptions,
  DeleteOptions,
  DeleteResult,
  
  // Encryption types
  EncryptedPayload,
  DecryptAPIResponse,
  DecryptConfig,
  
  // Utility types
  TypedArray,
  BrowserFile,
  BrowserBlob,
  
  // Error types
  SDKErrorDetails,
  
  // Callback types
  StorageCallbacks
} from './types/index.js';

// Error classes and utilities
export {
  SDKError,
  ErrorCategory,
  ErrorSeverity,
  ErrorHandler,
  createConfigError,
  createNetworkError,
  createFileError,
  createPaymentError,
  createEncryptionError,
  createContractError,
  createStorageError,
  createValidationError
} from './errors/index.js';

// Constants
export {
  FILE_SIZE,
  STORAGE_DEFAULTS,
  TOKEN_DECIMALS,
  TOKEN_AMOUNTS,
  BALANCE_THRESHOLDS,
  CHAIN_IDS,
  NETWORK_NAMES,
  TIME,
  AUTH_EXPIRATION,
  RETRY_CONFIG,
  TIMEOUT_CONFIG,
  LIT_PROTOCOL,
  FORMATTING,
  VALIDATION,
  bytesToMB,
  formatUSDFC,
  parseUSDFC,
  timestampToMs,
  calculateBackoffDelay,
  storageCapacityToBytes
} from './constants/index.js';

// Utility functions
export {
  hashData
} from './utils/hash.js';

export {
  generateRandomDataIdentifier
} from './utils/identifiers.js';

export {
  validateSDKConfig,
  validatePieceCid,
  validateAddress,
  validateDataIdentifier
} from './utils/validation.js';

// Module classes (for advanced usage)
export { LitEncryption } from './modules/encryption/LitEncryption.js';
export { ContractManager } from './modules/contracts/ContractManager.js';
export { StorageManager } from './modules/storage/StorageManager.js';

// Utility functions (for advanced usage)
export { getKernelClient } from './utils/getKernelClient.js';
export { deployPermissionedData } from './modules/contracts/deployPermissionedData.js';
export { mintOwnerNFT } from './modules/contracts/mintOwnerNFT.js';

// Contract ABIs (for advanced usage)
export {
  PermissionsRegistryAbi,
  PermissionedFileAbi
} from './modules/contracts/abis.js';

// Version
export const VERSION = '0.1.0';