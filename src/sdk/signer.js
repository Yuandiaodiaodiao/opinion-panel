const { ethers  } = require('ethers');
const { EIP712_DOMAIN,
  EIP712_TYPES,
  SignatureType,
  ZERO_ADDRESS
 } = require('./constants');
const { generateSalt, encodeGnosisSafeSignature  } = require('./utils');

/**
 * Create an order object for signing
 *
 * @param {object} params
 * @param {string} params.maker - Maker address (Gnosis Safe address)
 * @param {string} params.signer - Signer address (Owner of Gnosis Safe)
 * @param {string} params.tokenId - Token ID (YES or NO position)
 * @param {string} params.makerAmount - Maker amount in wei
 * @param {string} params.takerAmount - Taker amount in wei
 * @param {number} params.side - Order side (0: BUY, 1: SELL)
 * @param {string} params.expiration - Expiration timestamp (default: '0')
 * @param {string} params.feeRateBps - Fee rate in bps (default: '0')
 * @returns {object} Order object ready for signing
 */
function createOrder(params) {
  const {
    maker,
    signer,
    tokenId,
    makerAmount,
    takerAmount,
    side,
    expiration = '0',
    feeRateBps = '0'
  } = params;

  // Generate salt (timestamp in milliseconds)
  const salt = generateSalt();

  // Create order object matching the EIP-712 structure
  const order = {
    salt,
    maker: maker.toLowerCase(),
    signer: signer.toLowerCase(),
    taker: ZERO_ADDRESS,
    tokenId,
    makerAmount,
    takerAmount,
    expiration,
    nonce: '0',
    feeRateBps,
    side,
    signatureType: SignatureType.POLY_GNOSIS_SAFE
  };

  return order;
}

/**
 * Sign an order using EIP-712
 *
 * @param {ethers.Wallet} wallet - Ethers wallet instance
 * @param {object} order - Order object to sign
 * @returns {Promise<object>} Signed order with signature
 */
async function signOrder(wallet, order) {
  try {
    // Sign the typed data using EIP-712
    // This corresponds to the SignTypeDataV4 function in the original code (lines 170-203 in readme)
    const signature = await wallet.signTypedData(
      EIP712_DOMAIN,
      { Order: EIP712_TYPES.Order },
      order
    );

    // Return the order with the raw signature (not Gnosis Safe encoded)
    // API expects raw 65-byte ECDSA signature, not the Gnosis Safe format with address prefix
    return {
      ...order,
      signature
    };
  } catch (error) {
    throw new Error(`Failed to sign order: ${error.message}`);
  }
}

/**
 * Build and sign a complete order
 *
 * @param {ethers.Wallet} wallet - Ethers wallet instance
 * @param {object} orderParams - Order parameters
 * @returns {Promise<object>} Signed order object
 */
async function buildSignedOrder(wallet, orderParams) {
  // Create the order structure
  const order = createOrder(orderParams);

  // Sign the order
  const signedOrder = await signOrder(wallet, order);

  return signedOrder;
}


// Module exports
module.exports = {
  createOrder,
  signOrder,
  buildSignedOrder
};
