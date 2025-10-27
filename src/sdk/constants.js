/**
 * Opinion Trade SDK Constants
 */

// Chain configuration
const CHAIN_ID = 56; // BSC

// Contract addresses
const EXCHANGE_ADDRESS = '0x5F45344126D6488025B0b84A3A8189F2487a7246';
const COLLATERAL_TOKEN_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'; // USDT

// Token configuration
const COLLATERAL_TOKEN_DECIMAL = 18;

// API configuration
const API_BASE_URL = 'https://proxy.opinion.trade:8443/api/bsc/api';
const API_ENDPOINTS = {
  SUBMIT_ORDER: '/v2/order',
  QUERY_ORDERS: '/v2/order',
  QUERY_TRADES: '/v2/trade'
};

// EIP-712 Domain
const EIP712_DOMAIN = {
  name: 'OPINION CTF Exchange',
  version: '1',
  chainId: CHAIN_ID.toString(),
  verifyingContract: EXCHANGE_ADDRESS.toLowerCase()
};

// EIP-712 Types
const EIP712_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' }
  ]
};

// Order side
const Side = {
  BUY: 0,
  SELL: 1
};

// Signature type
const SignatureType = {
  POLY_GNOSIS_SAFE: 2
};

// Market type
const MarketType = {
  MARKET: 'Market',
  LIMIT: 'Limit'
};

// Trading method for API
const TradingMethod = {
  MARKET: 1,
  LIMIT: 2
};

// Volume type
const VolumeType = {
  SHARES: 'Shares',
  AMOUNT: 'Amount'
};

// Yes/No position
const YesOrNo = {
  YES: 1,
  NO: 2
};

// Zero address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Order query types
const OrderQueryType = {
  OPEN: 1,      // 未完成订单
  CLOSED: 2     // 已完成/取消订单
};

// Order status
const OrderStatus = {
  OPEN: 1,         // 未完成
  FILLED: 2,       // 已完成
  CANCELLED: 3     // 已取消
};

// Trade types (历史成交类型)
const TradeType = {
  SPLIT: 'Split',   // 拆分：以0.5价格买入
  BUY: 'Buy',       // 买入：按lastPrice买入
  SELL: 'Sell',     // 卖出：按lastPrice卖出
  MERGE: 'Merge'    // 合并：以0.5价格卖出
};


// Module exports
module.exports = {
  CHAIN_ID,
  EXCHANGE_ADDRESS,
  COLLATERAL_TOKEN_ADDRESS,
  COLLATERAL_TOKEN_DECIMAL,
  API_BASE_URL,
  API_ENDPOINTS,
  EIP712_DOMAIN,
  EIP712_TYPES,
  Side,
  SignatureType,
  MarketType,
  TradingMethod,
  VolumeType,
  YesOrNo,
  ZERO_ADDRESS,
  OrderQueryType,
  OrderStatus,
  TradeType
};
