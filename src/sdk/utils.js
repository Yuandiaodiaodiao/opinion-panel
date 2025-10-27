const { ethers  } = require('ethers');
const { COLLATERAL_TOKEN_DECIMAL  } = require('./constants');

/**
 * Convert human-readable amount to wei format
 * @param {string|number} amount - The amount to convert
 * @param {number} decimals - Token decimals (default: 18)
 * @returns {string} Amount in wei
 */
function toWei(amount, decimals = COLLATERAL_TOKEN_DECIMAL) {
  try {
    return ethers.parseUnits(amount.toString(), decimals).toString();
  } catch (error) {
    throw new Error(`Failed to convert amount to wei: ${error.message}`);
  }
}

/**
 * Convert wei format to human-readable amount
 * @param {string|bigint} wei - The wei amount
 * @param {number} decimals - Token decimals (default: 18)
 * @returns {string} Human-readable amount
 */
function fromWei(wei, decimals = COLLATERAL_TOKEN_DECIMAL) {
  try {
    return ethers.formatUnits(wei.toString(), decimals);
  } catch (error) {
    throw new Error(`Failed to convert wei to amount: ${error.message}`);
  }
}

/**
 * Generate order salt (timestamp in milliseconds)
 * @returns {string} Salt value
 */
function generateSalt() {
  return Date.now().toString();
}

/**
 * Calculate amount using high-precision BigInt arithmetic
 * Calculates: shares * price / 100 with proper rounding
 *
 * @param {string} shares - Number of shares (can have decimals)
 * @param {string} price - Price value (0-100, can have decimals)
 * @returns {string} Calculated amount with proper precision
 */
function calculateAmountWithBigInt(shares, price) {
  // Parse shares to avoid floating point errors
  const sharesParts = shares.toString().split('.');
  const sharesInt = sharesParts[0] || '0';
  const sharesDec = sharesParts[1] || '';

  // Parse price
  const priceParts = price.toString().split('.');
  const priceInt = priceParts[0] || '0';
  const priceDec = priceParts[1] || '';

  // Calculate max decimal places
  const sharesDecPlaces = sharesDec.length;
  const priceDecPlaces = priceDec.length;
  const totalDecPlaces = sharesDecPlaces + priceDecPlaces;

  // Convert to BigInt by removing decimal points
  const sharesBigInt = BigInt(sharesInt + sharesDec.padEnd(sharesDecPlaces, '0'));
  const priceBigInt = BigInt(priceInt + priceDec.padEnd(priceDecPlaces, '0'));

  // Multiply: shares * price
  const product = sharesBigInt * priceBigInt;

  // Divide by 100 and adjust for decimal places
  // We need to divide by 100 * 10^totalDecPlaces, but keep appropriate precision
  const divisor = BigInt(100) * (10n ** BigInt(totalDecPlaces));

  // To maintain precision, multiply by 10^18 first, then divide
  const resultScaled = (product * (10n ** 18n)) / divisor;

  // Convert back to decimal string with 18 decimal places
  const resultStr = resultScaled.toString().padStart(19, '0');
  const resultInt = resultStr.slice(0, -18) || '0';
  const resultDec = resultStr.slice(-18);

  // Remove trailing zeros from decimal part
  const trimmedDec = resultDec.replace(/0+$/, '');

  if (trimmedDec === '') {
    return resultInt;
  }
  return resultInt + '.' + trimmedDec;
}

/**
 * Calculate makerAmount and takerAmount based on order parameters
 * According to the code in readme.md (lines 76-90)
 *
 * @param {object} params
 * @param {number} params.side - Order side (0: BUY, 1: SELL)
 * @param {string} params.shares - Number of shares
 * @param {string} params.limitPrice - Limit price (0-100)
 * @param {string} params.volumeType - Volume type ('Shares' or 'Amount')
 * @param {string} params.buyInputVal - Buy input value (amount in currency)
 * @param {boolean} params.isStableCoin - Whether the collateral is stablecoin
 * @returns {object} { makerAmount, takerAmount }
 */
function calculateOrderAmounts(params) {
  const { side, shares, limitPrice, volumeType, buyInputVal, isStableCoin } = params;

  // Convert price: if not stablecoin, multiply by 100 (as per line 82 in readme)
  const price = isStableCoin ? limitPrice : String(100 * Number(limitPrice));

  let amount;

  // Calculate amount based on volume type (lines 78-83 in readme)
  if (volumeType === 'Shares') {
    // Calculate amount from shares and price using BigInt for precision
    // amount = shares * price / 100
    amount = calculateAmountWithBigInt(shares, price);
  } else {
    // Use the buyInputVal directly
    amount = buyInputVal;
  }

  let makerAmount, takerAmount;

  // Side 0 = BUY, Side 1 = SELL (lines 84-90 in readme)
  if (side === 0) { // BUY
    // BUY: maker provides amount, taker provides shares
    makerAmount = toWei(amount);
    takerAmount = toWei(shares);
  } else { // SELL
    // SELL: maker provides shares, taker provides amount
    makerAmount = toWei(shares);
    takerAmount = toWei(amount);
  }

  return {
    makerAmount,
    takerAmount
  };
}

/**
 * Encode Gnosis Safe signature
 * According to line 197 in readme: encodePacked([{ signer, data }])
 *
 * @param {string} signer - Signer address
 * @param {string} signature - Raw signature
 * @returns {string} Encoded signature
 */
function encodeGnosisSafeSignature(signer, signature) {
  // Remove '0x' prefix if present
  const cleanSignature = signature.startsWith('0x') ? signature.slice(2) : signature;
  const cleanSigner = signer.toLowerCase().startsWith('0x') ? signer.slice(2) : signer;

  // Gnosis Safe signature format: signer + signature
  // According to the code, it uses encodePacked format
  return '0x' + cleanSigner.toLowerCase() + cleanSignature;
}

/**
 * Validate Ethereum address
 * @param {string} address - Address to validate
 * @returns {boolean} Whether the address is valid
 */
function isValidAddress(address) {
  return ethers.isAddress(address);
}

/**
 * Normalize address to lowercase with 0x prefix
 * @param {string} address - Address to normalize
 * @returns {string} Normalized address
 */
function normalizeAddress(address) {
  if (!isValidAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return address.toLowerCase();
}

/**
 * Get current timestamp in seconds
 * @returns {number} Current Unix timestamp
 */
function getCurrentTimestamp() {
  return Math.round(Date.now() / 1000);
}


// Module exports
module.exports = {
  toWei,
  fromWei,
  generateSalt,
  calculateOrderAmounts,
  encodeGnosisSafeSignature,
  isValidAddress,
  normalizeAddress,
  getCurrentTimestamp
};
