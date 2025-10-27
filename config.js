/**
 * 预测市场配置文件
 */

require('dotenv').config();

module.exports = {
  // BSC RPC节点
  rpc: 'https://bsc.publicnode.com',

  // 账户地址
  account: process.env.MAKER_ADDRESS,

  // 合约地址
  contracts: {
    nft: '0xad1a38cec043e70e83a3ec30443db285ed10d774',     // BEP-1155 NFT
    usdt: '0x55d398326f99059ff775485246999027b3197955'    // USDT
  },

  // 订单簿API配置
  orderbook: {
    apiUrl: 'https://proxy.opinion.trade:8443/api/bsc/api/v2/order/market/depth',
    chainId: '56',
    refreshInterval: 7000  // 自动刷新间隔（毫秒）
  }
};
