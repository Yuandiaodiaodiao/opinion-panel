const { Side, VolumeType  } = require('./constants');
const { calculateOrderAmounts  } = require('./utils');

/**
 * Build order parameters for signing
 *
 * @param {object} params
 * @param {string} params.maker - Maker address (Gnosis Safe)
 * @param {string} params.signer - Signer address (Owner)
 * @param {string} params.tokenId - Token ID (YES or NO position)
 * @param {string} params.limitPrice - Limit price (0-100, can have 1 decimal place)
 * @param {string} params.shares - Number of shares
 * @param {number} params.side - Order side (0: BUY, 1: SELL)
 * @param {string} [params.volumeType='Shares'] - Volume type ('Shares' or 'Amount')
 * @param {string} [params.buyInputVal] - Buy input value (required if volumeType is 'Amount')
 * @param {boolean} [params.isStableCoin=true] - Whether collateral is stablecoin
 * @param {string} [params.expiration='0'] - Expiration timestamp
 * @param {string} [params.feeRateBps='0'] - Fee rate in bps
 * @returns {object} Order parameters ready for signing
 */
function buildOrderParams(params) {
  const {
    maker,
    signer,
    tokenId,
    limitPrice,
    shares,
    side,
    volumeType = VolumeType.SHARES,
    buyInputVal = '0',
    isStableCoin = true,
    expiration = '0',
    feeRateBps = '0'
  } = params;

  // Validate required parameters
  if (!maker || !signer || !tokenId || !limitPrice || !shares) {
    throw new Error('Missing required parameters: maker, signer, tokenId, limitPrice, shares');
  }

  // Validate side
  if (side !== Side.BUY && side !== Side.SELL) {
    throw new Error(`Invalid side: ${side}. Must be ${Side.BUY} (BUY) or ${Side.SELL} (SELL)`);
  }

  // Validate limit price (0-100, max 1 decimal place)
  const price = parseFloat(limitPrice);
  if (isNaN(price) || price < 0 || price > 100) {
    throw new Error('Limit price must be between 0 and 100');
  }

  // Calculate makerAmount and takerAmount
  const { makerAmount, takerAmount } = calculateOrderAmounts({
    side,
    shares,
    limitPrice,
    volumeType,
    buyInputVal,
    isStableCoin
  });

  // Build order parameters
  const orderParams = {
    maker,
    signer,
    tokenId,
    makerAmount,
    takerAmount,
    side,
    expiration,
    feeRateBps
  };

  return orderParams;
}

/**
 * Convert price to API format using high-precision BigInt arithmetic
 * Divides by 100 and rounds to 3 decimal places
 *
 * @param {string} limitPrice - Price string (0-100, max 1 decimal)
 * @returns {string} Price formatted to 3 decimals (e.g., "99.11" -> "0.991")
 */
function formatPriceWithBigInt(limitPrice) {
  // Parse the price string to avoid floating point errors
  const parts = limitPrice.toString().split('.');
  const integerPart = parts[0] || '0';
  const decimalPart = (parts[1] || '0').padEnd(2, '0'); // Ensure at least 2 decimal places

  // Build integer representation (multiply by 100)
  const fullInteger = integerPart + decimalPart;
  const bigIntValue = BigInt(fullInteger);

  // Divide by 100 and maintain 3 decimal precision
  // bigIntValue represents limitPrice * 100
  // We want (limitPrice / 100) with 3 decimals = (bigIntValue / 100 / 100) with 3 decimals
  // = bigIntValue / 10000 with 3 decimals
  // = (bigIntValue * 1000) / 10000
  const resultTimes1000 = bigIntValue * 1000n / 10000n;

  // Convert to string with proper decimal placement
  const resultStr = resultTimes1000.toString().padStart(4, '0');
  const resultInt = resultStr.slice(0, -3) || '0';
  const resultDec = resultStr.slice(-3);

  return resultInt + '.' + resultDec;
}

/**
 * Build API request payload for submitting order
 * This corresponds to the W function in readme.md (lines 317-343)
 *
 * @param {object} params
 * @param {object} params.signedOrder - Signed order object
 * @param {string} params.topicId - Topic ID of the prediction market
 * @param {string} params.limitPrice - Limit price (0-100)
 * @param {string} params.collateralTokenAddr - Collateral token address
 * @param {number} params.chainId - Chain ID
 * @param {boolean} [params.isStableCoin=true] - Whether collateral is stablecoin
 * @param {string} [params.safeRate='0'] - Safe rate
 * @returns {object} API request payload
 */
function buildApiPayload(params) {
  const {
    signedOrder,
    topicId,
    limitPrice,
    collateralTokenAddr,
    chainId,
    isStableCoin = true,
    safeRate = '0'
  } = params;

  // Calculate price for API (line 320 in readme)
  // If stablecoin: price / 100 rounded to 3 decimals, else: price as is
  const apiPrice = isStableCoin
    ? formatPriceWithBigInt(limitPrice)
    : limitPrice;

  // Build API payload (lines 322-342 in readme)
  const payload = {
    topicId: parseInt(topicId), // Convert to number
    contractAddress: '',
    price: apiPrice,
    tradingMethod: 2, // 2 = LIMIT (line 326)
    salt: signedOrder.salt,
    maker: signedOrder.maker,
    signer: signedOrder.signer,
    taker: signedOrder.taker,
    tokenId: signedOrder.tokenId,
    makerAmount: signedOrder.makerAmount,
    takerAmount: signedOrder.takerAmount,
    expiration: signedOrder.expiration,
    nonce: signedOrder.nonce,
    feeRateBps: signedOrder.feeRateBps,
    side: String(signedOrder.side),
    signatureType: String(signedOrder.signatureType),
    signature: signedOrder.signature, // The signature (required by API)
    timestamp: Math.round(Date.now() / 1000), // Current timestamp in seconds
    sign: signedOrder.signature, // The signature (same as signature field)
    safeRate,
    orderExpTime: signedOrder.expiration,
    currencyAddress: collateralTokenAddr,
    chainId
  };

  return payload;
}


// Module exports
module.exports = {
  buildOrderParams,
  buildApiPayload
};
