import { createValidationError } from '../errors/index.js';
import type { SDKConfig } from '../types/index.js';

/**
 * Validate SDK configuration
 */
export function validateSDKConfig(config: SDKConfig): void {
  // Validate network
  if (!['mainnet', 'calibration'].includes(config.network)) {
    throw createValidationError('Invalid network configuration', {
      userMessage: 'Network must be either "mainnet" or "calibration"',
      details: { network: config.network }
    });
  }

  // Validate encryption config if provided
  if (config.encryption) {
    if (!config.encryption.registryAddress) {
      throw createValidationError('Invalid encryption configuration', {
        userMessage: 'Registry address is required for encryption',
        details: { missing: 'registryAddress' }
      });
    }

    if (!config.encryption.validationAddress) {
      throw createValidationError('Invalid encryption configuration', {
        userMessage: 'Validation address is required for encryption',
        details: { missing: 'validationAddress' }
      });
    }

    if (!config.encryption.bundlerRpcUrl) {
      throw createValidationError('Invalid encryption configuration', {
        userMessage: 'Bundler RPC URL is required for encryption',
        details: { missing: 'bundlerRpcUrl' }
      });
    }
  }

  // Validate storage config if provided
  if (config.storage) {
    if (config.storage.capacityGB !== undefined && config.storage.capacityGB <= 0) {
      throw createValidationError('Invalid storage configuration', {
        userMessage: 'Storage capacity must be greater than 0',
        details: { capacityGB: config.storage.capacityGB }
      });
    }

    if (config.storage.persistenceDays !== undefined && config.storage.persistenceDays <= 0) {
      throw createValidationError('Invalid storage configuration', {
        userMessage: 'Persistence period must be greater than 0',
        details: { persistenceDays: config.storage.persistenceDays }
      });
    }
  }
}

/**
 * Validate piece CID format
 */
export function validatePieceCid(pieceCid: string): void {
  if (!pieceCid || typeof pieceCid !== 'string') {
    throw createValidationError('Invalid piece CID', {
      userMessage: 'Piece CID must be a non-empty string',
      details: { pieceCid }
    });
  }

  // Basic validation for CID format
  if (!pieceCid.startsWith('baga') && !pieceCid.startsWith('bafk') && !pieceCid.startsWith('bafy')) {
    throw createValidationError('Invalid piece CID format', {
      userMessage: 'Piece CID must be a valid IPFS CID',
      details: { pieceCid }
    });
  }
}

/**
 * Validate Ethereum address format
 */
export function validateAddress(address: string): void {
  if (!address || typeof address !== 'string') {
    throw createValidationError('Invalid address', {
      userMessage: 'Address must be a non-empty string',
      details: { address }
    });
  }

  // Check if it's a valid Ethereum address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw createValidationError('Invalid Ethereum address format', {
      userMessage: 'Address must be a valid Ethereum address (0x followed by 40 hex characters)',
      details: { address }
    });
  }
}

/**
 * Validate data identifier format
 */
export function validateDataIdentifier(dataIdentifier: string): void {
  if (!dataIdentifier || typeof dataIdentifier !== 'string') {
    throw createValidationError('Invalid data identifier', {
      userMessage: 'Data identifier must be a non-empty string',
      details: { dataIdentifier }
    });
  }

  // Data identifiers are typically 64 character hex strings (SHA-256 hashes)
  if (!/^[a-fA-F0-9]{64}$/.test(dataIdentifier)) {
    throw createValidationError('Invalid data identifier format', {
      userMessage: 'Data identifier must be a 64 character hex string',
      details: { dataIdentifier }
    });
  }
}