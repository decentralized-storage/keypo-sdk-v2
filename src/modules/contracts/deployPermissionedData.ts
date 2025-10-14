import { encodeFunctionData } from "viem";
import { createContractError } from '../../errors/index.js';

export interface PermissionParameters {
  permissionType: number;
  permissionAddress: string;
  tokenQuantity: number;
  timeLimitBlockNumber: number;
  operator: number;
}

/**
 * Deploy file and write permissions to the PermissionsRegistry
 */
export const deployPermissionedData = async (
  fileIdentifier: string,
  fileMetaData: string,
  kernelClient: any, // Using any for now since we need the kernel client's methods
  signerAddress: string,
  contractAddress: string,
  validatorAddress: string,
  abi: any,
  customParameters?: PermissionParameters[],
  debug?: boolean,
) => {
  const parameters = customParameters || [
    {
      permissionType: 0,
      permissionAddress: signerAddress,
      tokenQuantity: 1,
      timeLimitBlockNumber: 0,
      operator: 0,
    },
  ];

  try {
    const txData = encodeFunctionData({
      abi: abi,
      functionName: "deployPermissionedFile",
      args: [fileIdentifier, fileMetaData, parameters, signerAddress, validatorAddress],
    });

    if (debug) {
      console.log("[DEBUG] deployPermissionedData txData:", txData);
    }

    // Prepare the user operation with explicit gas settings
    const userOperation = {
      callData: await kernelClient.account.encodeCalls([{
        to: contractAddress as `0x${string}`,
        value: BigInt(0),
        data: txData,
      }]),
    };

    if (debug) {
      console.log("[DEBUG] Sending user operation with callData:", userOperation.callData);
    }

    // Add timeout to sendUserOperation
    const userOpHash = await Promise.race([
      kernelClient.sendUserOperation(userOperation),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: sendUserOperation took too long')), 30000)
      )
    ]);

    if (debug) {
      console.log("[DEBUG] userOpHash:", userOpHash);
    }

    // Add timeout to waitForUserOperationReceipt
    const { receipt } = await Promise.race([
      kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: waitForUserOperationReceipt took too long')), 60000)
      )
    ]);

    if (debug) {
      console.log("[DEBUG] receipt:", receipt);
    }

    return receipt.transactionHash;
  } catch (error: any) {
    console.error("Error sending user operation:", error);
    
    // Log more detailed error information
    if (error.message) {
      console.error("Error message:", error.message);
    }
    if (error.cause) {
      console.error("Error cause:", error.cause);
    }
    if (error.stack) {
      console.error("Error stack:", error.stack);
    }
    
    // Check for specific error types
    if (error.message && error.message.includes("UserOperation reverted during simulation")) {
      console.error("UserOperation simulation failed - this could be due to:");
      console.error("1. Insufficient gas estimation");
      console.error("2. Contract state issues");
      console.error("3. Network congestion");
      console.error("4. Invalid parameters");
    }
    
    throw createContractError('Failed to deploy permissioned data contract', {
      cause: error,
      userMessage: 'Could not deploy smart contract for file permissions',
      details: { fileIdentifier, contractAddress }
    });
  }
};