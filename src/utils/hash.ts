import { createHash } from 'crypto';

/**
 * Generate SHA-256 hash of data
 */
export const hashData = (data: Uint8Array | Buffer): string => {
  return createHash('sha256').update(Buffer.from(data)).digest('hex');
};