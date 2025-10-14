/**
 * Error handling system for Synapse Storage SDK
 */

import type { SDKErrorDetails } from '../types/index.js';

export enum ErrorCategory {
  CONFIG = 'CONFIGURATION',
  NETWORK = 'NETWORK',
  FILE = 'FILE',
  PERMISSION = 'PERMISSION',
  VALIDATION = 'VALIDATION',
  ENCRYPTION = 'ENCRYPTION',
  CONTRACT = 'CONTRACT',
  PAYMENT = 'PAYMENT',
  STORAGE = 'STORAGE',
  UNKNOWN = 'UNKNOWN'
}

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  FATAL = 'fatal'
}

export interface SDKErrorOptions extends SDKErrorDetails {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  recoverable?: boolean;
}

/**
 * Base error class for SDK errors
 */
export class SDKError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public override readonly cause?: unknown;
  public readonly details?: Record<string, any>;
  public readonly userMessage: string;
  public readonly code?: string;
  public readonly recoverable: boolean;
  public readonly timestamp: Date;

  constructor(message: string, options: SDKErrorOptions = {}) {
    super(message);
    this.name = 'SDKError';
    this.category = options.category || ErrorCategory.UNKNOWN;
    this.severity = options.severity || ErrorSeverity.ERROR;
    this.cause = options.cause;
    this.details = options.details;
    this.userMessage = options.userMessage || message;
    this.code = options.code;
    this.recoverable = options.recoverable ?? false;
    this.timestamp = new Date();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to a plain object for serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      userMessage: this.userMessage,
      code: this.code,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * Error handler utility class
 */
export class ErrorHandler {
  /**
   * Normalize any error to SDKError
   */
  static normalize(error: unknown): SDKError {
    if (error instanceof SDKError) {
      return error;
    }

    if (error instanceof Error) {
      const category = ErrorHandler.categorizeError(error);
      const severity = ErrorHandler.determineSeverity(error);
      
      return new SDKError(error.message, {
        category,
        severity,
        cause: error,
        userMessage: ErrorHandler.createUserMessage(error, category),
        recoverable: ErrorHandler.isRecoverable(error, category)
      });
    }

    // Handle non-Error objects
    return new SDKError('An unknown error occurred', {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.ERROR,
      cause: error,
      userMessage: 'An unexpected error occurred. Please try again.',
      recoverable: false
    });
  }

  private static categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    
    if (message.includes('environment') || message.includes('config')) {
      return ErrorCategory.CONFIG;
    }
    
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return ErrorCategory.NETWORK;
    }
    
    if (message.includes('file') || message.includes('enoent') || message.includes('directory')) {
      return ErrorCategory.FILE;
    }
    
    if (message.includes('permission') || message.includes('access') || message.includes('denied')) {
      return ErrorCategory.PERMISSION;
    }
    
    if (message.includes('encrypt') || message.includes('decrypt') || message.includes('lit protocol')) {
      return ErrorCategory.ENCRYPTION;
    }
    
    if (message.includes('contract') || message.includes('revert') || message.includes('useroperation')) {
      return ErrorCategory.CONTRACT;
    }
    
    if (message.includes('balance') || message.includes('insufficient') || message.includes('usdfc')) {
      return ErrorCategory.PAYMENT;
    }

    if (message.includes('storage') || message.includes('synapse') || message.includes('filecoin')) {
      return ErrorCategory.STORAGE;
    }
    
    return ErrorCategory.UNKNOWN;
  }

  private static determineSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();
    
    if (message.includes('warning') || message.includes('deprecated')) {
      return ErrorSeverity.WARNING;
    }
    
    if (message.includes('fatal') || message.includes('critical')) {
      return ErrorSeverity.FATAL;
    }
    
    return ErrorSeverity.ERROR;
  }

  private static createUserMessage(error: Error, category: ErrorCategory): string {
    const baseMessages: Record<ErrorCategory, string> = {
      [ErrorCategory.CONFIG]: 'Configuration error. Please check your SDK configuration.',
      [ErrorCategory.NETWORK]: 'Network connection issue. Please check your internet connection.',
      [ErrorCategory.FILE]: 'File operation failed. Please check the file path and permissions.',
      [ErrorCategory.PERMISSION]: 'Permission denied. You may not have access to this resource.',
      [ErrorCategory.VALIDATION]: 'Validation failed. Please check your input.',
      [ErrorCategory.ENCRYPTION]: 'Encryption/decryption operation failed.',
      [ErrorCategory.CONTRACT]: 'Smart contract operation failed.',
      [ErrorCategory.PAYMENT]: 'Payment or balance issue.',
      [ErrorCategory.STORAGE]: 'Storage operation failed.',
      [ErrorCategory.UNKNOWN]: 'An unexpected error occurred.'
    };

    // Add specific guidance for common errors
    const message = error.message.toLowerCase();
    
    if (message.includes('insufficient usdfc')) {
      return 'Insufficient USDFC balance. Please deposit funds.';
    }
    
    if (message.includes('private_key')) {
      return 'Private key not configured.';
    }
    
    if (message.includes('not found') && category === ErrorCategory.FILE) {
      return 'File not found. Please check that the file exists and the path is correct.';
    }
    
    if (message.includes('useroperation reverted')) {
      return 'Smart contract transaction failed. This may be due to network congestion or insufficient gas.';
    }

    if (message.includes('failed to verify signature')) {
      return 'Signature verification failed. Please ensure you are using the correct wallet.';
    }
    
    return baseMessages[category];
  }

  private static isRecoverable(error: Error, category: ErrorCategory): boolean {
    // Network errors are often recoverable with retry
    if (category === ErrorCategory.NETWORK) {
      return true;
    }
    
    // Some contract errors can be recovered with retry
    if (category === ErrorCategory.CONTRACT) {
      const message = error.message.toLowerCase();
      return message.includes('congestion') || message.includes('timeout');
    }
    
    // Configuration and validation errors are not recoverable
    if (category === ErrorCategory.CONFIG || category === ErrorCategory.VALIDATION) {
      return false;
    }
    
    return false;
  }
}

// Convenience functions for creating specific error types
export const createConfigError = (
  message: string,
  options?: Omit<SDKErrorOptions, 'category'>
): SDKError => {
  return new SDKError(message, {
    ...options,
    category: ErrorCategory.CONFIG,
    severity: ErrorSeverity.FATAL
  });
};

export const createNetworkError = (
  message: string,
  options?: Omit<SDKErrorOptions, 'category'>
): SDKError => {
  return new SDKError(message, {
    ...options,
    category: ErrorCategory.NETWORK,
    recoverable: true
  });
};

export const createFileError = (
  message: string,
  options?: Omit<SDKErrorOptions, 'category'>
): SDKError => {
  return new SDKError(message, {
    ...options,
    category: ErrorCategory.FILE
  });
};

export const createPaymentError = (
  message: string,
  options?: Omit<SDKErrorOptions, 'category'>
): SDKError => {
  return new SDKError(message, {
    ...options,
    category: ErrorCategory.PAYMENT
  });
};

export const createEncryptionError = (
  message: string,
  options?: Omit<SDKErrorOptions, 'category'>
): SDKError => {
  return new SDKError(message, {
    ...options,
    category: ErrorCategory.ENCRYPTION
  });
};

export const createContractError = (
  message: string,
  options?: Omit<SDKErrorOptions, 'category'>
): SDKError => {
  return new SDKError(message, {
    ...options,
    category: ErrorCategory.CONTRACT
  });
};

export const createStorageError = (
  message: string,
  options?: Omit<SDKErrorOptions, 'category'>
): SDKError => {
  return new SDKError(message, {
    ...options,
    category: ErrorCategory.STORAGE
  });
};

export const createValidationError = (
  message: string,
  options?: Omit<SDKErrorOptions, 'category'>
): SDKError => {
  return new SDKError(message, {
    ...options,
    category: ErrorCategory.VALIDATION
  });
};