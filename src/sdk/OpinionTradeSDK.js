const { ethers  } = require('ethers');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { CHAIN_ID,
  COLLATERAL_TOKEN_ADDRESS,
  API_BASE_URL,
  API_ENDPOINTS,
  Side,
  VolumeType,
  YesOrNo,
  OrderQueryType,
  OrderStatus
 } = require('./constants');
const { buildSignedOrder  } = require('./signer');
const { buildOrderParams, buildApiPayload  } = require('./orderBuilder');
const TopicAPI = require('./TopicAPI');

/**
 * Opinion Trade SDK
 * SDK for interacting with Opinion Trade prediction market
 */
class OpinionTradeSDK {
  /**
   * Create an instance of OpinionTradeSDK
   *
   * @param {object} config
   * @param {string} config.privateKey - Private key of the signer (owner of Gnosis Safe)
   * @param {string} config.makerAddress - Maker address (Gnosis Safe address)
   * @param {string} [config.collateralTokenAddr] - Collateral token address (default: USDT)
   * @param {number} [config.chainId] - Chain ID (default: 56 for BSC)
   * @param {string} [config.apiBaseUrl] - API base URL (default: opinion.trade API)
   */
  constructor(config) {
    const {
      privateKey,
      makerAddress,
      authorizationToken,
      collateralTokenAddr = COLLATERAL_TOKEN_ADDRESS,
      chainId = CHAIN_ID,
      apiBaseUrl = API_BASE_URL
    } = config;

    if (!privateKey) {
      throw new Error('Private key is required');
    }

    if (!makerAddress) {
      throw new Error('Maker address (Gnosis Safe) is required');
    }

    // Create wallet from private key
    this.wallet = new ethers.Wallet(privateKey);
    this.signerAddress = this.wallet.address;

    // Store configuration
    this.makerAddress = makerAddress.toLowerCase();
    this.collateralTokenAddr = collateralTokenAddr.toLowerCase();
    this.chainId = chainId;
    this.apiBaseUrl = apiBaseUrl;
    this.authorizationToken = authorizationToken; // 可选的authorization token

    // Initialize TopicAPI for auto-fetching topic information
    this.topicAPI = new TopicAPI();

    // Configure axios with proxy support
    this.axiosConfig = {
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024, // 10MB
      maxBodyLength: 10 * 1024 * 1024,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://app.opinion.trade/',
        'Origin': 'https://app.opinion.trade',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      }
    };

    // Add proxy support from environment variable
    if (process.env.HTTPS_PROXY) {
      console.log(`Using proxy: ${process.env.HTTPS_PROXY}`);
      this.axiosConfig.httpsAgent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
      this.axiosConfig.proxy = false; // Disable axios default proxy handling
    }

    // Add authorization token if provided
    if (this.authorizationToken) {
      const token = this.authorizationToken.startsWith('Bearer ')
        ? this.authorizationToken
        : `Bearer ${this.authorizationToken}`;
      this.axiosConfig.headers['Authorization'] = token;
    }
  }

  /**
   * Create and submit a limit order
   *
   * @param {object} params
   * @param {string} params.topicId - Topic ID of the prediction market
   * @param {string} params.tokenId - Token ID (YES or NO position)
   * @param {string} params.limitPrice - Limit price (0-100, max 1 decimal place)
   * @param {string} params.shares - Number of shares
   * @param {number} params.side - Order side (0: BUY, 1: SELL)
   * @param {string} [params.volumeType='Shares'] - Volume type ('Shares' or 'Amount')
   * @param {string} [params.buyInputVal='0'] - Buy input value (required if volumeType is 'Amount')
   * @param {boolean} [params.isStableCoin=true] - Whether collateral is stablecoin
   * @param {string} [params.safeRate='0'] - Safe rate
   * @returns {Promise<object>} API response
   */
  async createLimitOrder(params) {
    const {
      topicId,
      tokenId,
      limitPrice,
      shares,
      side,
      volumeType = VolumeType.SHARES,
      buyInputVal = '0',
      isStableCoin = true,
      safeRate = '0'
    } = params;

    try {
      console.log('Creating limit order...');
      console.log('Parameters:', {
        topicId,
        tokenId,
        limitPrice,
        shares,
        side: side === Side.BUY ? 'BUY' : 'SELL',
        volumeType
      });

      // Step 1: Build order parameters
      const orderParams = buildOrderParams({
        maker: this.makerAddress,
        signer: this.signerAddress,
        tokenId,
        limitPrice,
        shares,
        side,
        volumeType,
        buyInputVal,
        isStableCoin
      });

      console.log('Order parameters built');

      // Step 2: Sign the order
      const signedOrder = await buildSignedOrder(this.wallet, orderParams);

      console.log('Order signed successfully');
      console.log('Signature:', signedOrder.signature);

      // Step 3: Build API payload
      const apiPayload = buildApiPayload({
        signedOrder,
        topicId,
        limitPrice,
        collateralTokenAddr: this.collateralTokenAddr,
        chainId: this.chainId,
        isStableCoin,
        safeRate
      });

      console.log('API payload built');
      console.log('API payload preview:', JSON.stringify({
        topicId: apiPayload.topicId,
        price: apiPayload.price,
        side: apiPayload.side,
        makerAmount: apiPayload.makerAmount,
        takerAmount: apiPayload.takerAmount
      }, null, 2));
      console.log();
      // Step 4: Submit order to API
      const response = await this.submitOrder(apiPayload);

      console.log('Order submitted successfully');

      return response;
    } catch (error) {
      console.error('Failed to create limit order:', error.message);
      throw error;
    }
  }

  /**
   * Submit order to API
   * Corresponds to SubmitOrderV2 in readme.md (lines 395-396)
   *
   * @param {object} payload - Order payload
   * @returns {Promise<object>} API response
   */
  async submitOrder(payload) {
    try {
      const url = `${this.apiBaseUrl}${API_ENDPOINTS.SUBMIT_ORDER}`;
      console.log('Submitting order to API...');
      console.log('API URL:', url);
      console.log('Full payload:', JSON.stringify(payload, null, 2));

      if (this.authorizationToken) {
        console.log('Using authorization token');
      } else {
        console.warn('⚠️  WARNING: No authorization token provided. API call may fail.');
      }

      const responseData = await this._makeRequest('POST', url, payload);
      console.log('API response data:', JSON.stringify(responseData, null, 2));

      return responseData;
    } catch (error) {
      console.error('Submit order error:', error.message);
      throw error;
    }
  }

  /**
   * Helper: Create a BUY limit order
   */
  async buy(params) {
    return this.createLimitOrder({
      ...params,
      side: Side.BUY
    });
  }

  /**
   * Helper: Create a SELL limit order
   */
  async sell(params) {
    return this.createLimitOrder({
      ...params,
      side: Side.SELL
    });
  }

  /**
   * Get signer address
   */
  getSignerAddress() {
    return this.signerAddress;
  }

  /**
   * Get maker address
   */
  getMakerAddress() {
    return this.makerAddress;
  }

  /**
   * Internal: Make HTTP request with axios
   * @private
   * @param {string} method - HTTP method (GET/POST)
   * @param {string} url - Request URL
   * @param {object} data - Request payload (for POST)
   * @returns {Promise<object>} Response data
   */
  async _makeRequest(method, url, data = null) {
    try {
      const config = {
        ...this.axiosConfig,
        method,
        url
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);

      // Check API error code
      if (response.data.errno !== undefined && response.data.errno !== 0) {
        throw new Error(`API error (errno: ${response.data.errno}): ${response.data.errmsg || 'Unknown error'}`);
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        // HTTP error response
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      } else if (error.request) {
        // No response received
        throw new Error(`No response from server: ${error.message}`);
      } else {
        // Other errors
        throw error;
      }
    }
  }

  /**
   * Get topic information (with caching)
   *
   * @param {string|number} topicId - Topic ID
   * @param {boolean} forceRefresh - Force refresh from API
   * @returns {Promise<object>} Topic information
   */
  async getTopicInfo(topicId, forceRefresh = false) {
    return await this.topicAPI.getTopicInfo(topicId, forceRefresh);
  }

  /**
   * Create limit order by topic (auto-fetch token IDs)
   * Only need topicId and position (YES/NO), other info will be fetched automatically
   *
   * @param {object} params
   * @param {string} params.topicId - Topic ID
   * @param {string} params.position - Position: 'YES' or 'NO'
   * @param {string} params.limitPrice - Limit price (0-100)
   * @param {string} params.shares - Number of shares
   * @param {number} params.side - Order side (0: BUY, 1: SELL)
   * @param {string} [params.volumeType='Shares'] - Volume type
   * @param {string} [params.buyInputVal='0'] - Buy input value
   * @param {boolean} [params.isStableCoin=true] - Whether collateral is stablecoin
   * @param {string} [params.safeRate='0'] - Safe rate
   * @returns {Promise<object>} API response
   */
  async createOrderByTopic(params) {
    const {
      topicId,
      position,
      limitPrice,
      shares,
      side,
      volumeType = VolumeType.SHARES,
      buyInputVal = '0',
      isStableCoin = true,
      safeRate = '0'
    } = params;

    // Validate position
    const positionUpper = position.toUpperCase();
    if (positionUpper !== 'YES' && positionUpper !== 'NO') {
      throw new Error('Position must be "YES" or "NO"');
    }

    console.log(`→ Fetching topic info for Topic ${topicId}...`);

    // Fetch topic info to get token IDs
    const topicInfo = await this.getTopicInfo(topicId);

    // Select token ID based on position
    const tokenId = positionUpper === 'YES' ? topicInfo.yesToken : topicInfo.noToken;

    if (!tokenId) {
      throw new Error(`${positionUpper} token ID not found for topic ${topicId}`);
    }

    console.log(`✓ Topic: ${topicInfo.title}`);
    console.log(`✓ Token ID (${positionUpper}): ${tokenId}`);

    // Create order with the fetched token ID
    return await this.createLimitOrder({
      topicId,
      tokenId,
      limitPrice,
      shares,
      side,
      volumeType,
      buyInputVal,
      isStableCoin,
      safeRate
    });
  }

  /**
   * Buy by topic (auto-fetch token IDs)
   *
   * @param {object} params
   * @param {string} params.topicId - Topic ID
   * @param {string} params.position - Position: 'YES' or 'NO'
   * @param {string} params.limitPrice - Limit price (0-100)
   * @param {string} params.shares - Number of shares
   * @returns {Promise<object>} API response
   */
  async buyByTopic(params) {
    return this.createOrderByTopic({
      ...params,
      side: Side.BUY
    });
  }

  /**
   * Sell by topic (auto-fetch token IDs)
   *
   * @param {object} params
   * @param {string} params.topicId - Topic ID
   * @param {string} params.position - Position: 'YES' or 'NO'
   * @param {string} params.limitPrice - Limit price (0-100)
   * @param {string} params.shares - Number of shares
   * @returns {Promise<object>} API response
   */
  async sellByTopic(params) {
    return this.createOrderByTopic({
      ...params,
      side: Side.SELL
    });
  }

  /**
   * Clear topic cache
   *
   * @param {string|number} topicId - Topic ID (optional, if not provided, clear all)
   */
  async clearTopicCache(topicId = null) {
    if (topicId) {
      await this.topicAPI.clearCache(topicId);
    } else {
      await this.topicAPI.clearAllCache();
    }
  }

  /**
   * List all cached topics
   *
   * @returns {Promise<Array>} List of cached topics
   */
  async listCachedTopics() {
    return await this.topicAPI.listCachedTopics();
  }

  /**
   * Query orders
   *
   * @param {object} params
   * @param {string} params.walletAddress - Wallet address to query
   * @param {number} params.queryType - Query type (1: open orders, 2: closed orders)
   * @param {string|number} [params.topicId] - Topic ID (optional, if not provided, query all topics)
   * @param {number} [params.page=1] - Page number
   * @param {number} [params.limit=10] - Items per page
   * @returns {Promise<object>} Orders response with list and total
   */
  async queryOrders(params) {
    const {
      walletAddress,
      queryType,
      topicId,
      page = 1,
      limit = 10
    } = params;

    if (!walletAddress) {
      throw new Error('walletAddress is required');
    }

    if (!queryType || (queryType !== OrderQueryType.OPEN && queryType !== OrderQueryType.CLOSED)) {
      throw new Error('queryType must be 1 (OPEN) or 2 (CLOSED)');
    }

    try {
      // Build URL with query parameters
      let url = `${this.apiBaseUrl}${API_ENDPOINTS.QUERY_ORDERS}?page=${page}&limit=${limit}&walletAddress=${walletAddress}&queryType=${queryType}`;

      if (topicId) {
        url += `&topicId=${topicId}`;
      }

      if (!this.authorizationToken) {
        console.warn('⚠️  WARNING: No authorization token provided. API call may fail.');
      }

      const responseData = await this._makeRequest('GET', url);

      // 兼容空订单情况：当 list 为 null 时转换为空数组
      const result = responseData.result || {};
      const list = result.list || [];
      const total = result.total || 0;

      // console.log(`✓ Found ${total} order(s), showing ${list.length}`);

      return {
        list,
        total
      };
    } catch (error) {
      console.error('Query orders error:', error.message);
      throw error;
    }
  }

  /**
   * Get open orders (未完成订单)
   *
   * @param {object} params
   * @param {string} [params.walletAddress] - Wallet address (default: signer address derived from private key)
   * @param {string|number} [params.topicId] - Topic ID (optional)
   * @param {number} [params.page=1] - Page number
   * @param {number} [params.limit=10] - Items per page
   * @returns {Promise<object>} Orders response with list and total
   */
  async getOpenOrders(params = {}) {
    const walletAddress = params.walletAddress || this.signerAddress;
    return this.queryOrders({
      ...params,
      walletAddress,
      queryType: OrderQueryType.OPEN
    });
  }

  /**
   * Get closed orders (已完成/取消订单)
   *
   * @param {object} params
   * @param {string} [params.walletAddress] - Wallet address (default: signer address derived from private key)
   * @param {string|number} [params.topicId] - Topic ID (optional)
   * @param {number} [params.page=1] - Page number
   * @param {number} [params.limit=10] - Items per page
   * @returns {Promise<object>} Orders response with list and total
   */
  async getClosedOrders(params = {}) {
    const walletAddress = params.walletAddress || this.signerAddress;
    return this.queryOrders({
      ...params,
      walletAddress,
      queryType: OrderQueryType.CLOSED
    });
  }

  /**
   * Query trade history (历史成交查询)
   *
   * @param {object} params
   * @param {string} params.walletAddress - Wallet address to query
   * @param {string|number} [params.topicId] - Topic ID (optional, if not provided, query all topics)
   * @param {number} [params.page=1] - Page number
   * @param {number} [params.limit=10] - Items per page
   * @returns {Promise<object>} Trades response with list and total
   */
  async queryTrades(params) {
    const {
      walletAddress,
      topicId,
      page = 1,
      limit = 10
    } = params;

    if (!walletAddress) {
      throw new Error('walletAddress is required');
    }

    try {
      // Build URL with query parameters
      let url = `${this.apiBaseUrl}${API_ENDPOINTS.QUERY_TRADES}?page=${page}&limit=${limit}&walletAddress=${walletAddress}`;

      if (topicId) {
        url += `&topicId=${topicId}`;
      }

      if (!this.authorizationToken) {
        console.warn('⚠️  WARNING: No authorization token provided. API call may fail.');
      }

      const responseData = await this._makeRequest('GET', url);

      // 兼容空交易情况：当 list 为 null 时转换为空数组
      const result = responseData.result || {};
      const list = result.list || [];
      const total = result.total || 0;

      console.log(`✓ Found ${total} trade(s), showing ${list.length}`);

      return {
        list,
        total
      };
    } catch (error) {
      console.error('Query trades error:', error.message);
      throw error;
    }
  }

  /**
   * Get all trades for a wallet (获取所有历史成交)
   * Automatically fetches all pages
   *
   * @param {object} params
   * @param {string} [params.walletAddress] - Wallet address (default: signer address)
   * @param {string|number} [params.topicId] - Topic ID (optional)
   * @returns {Promise<Array>} All trades
   */
  async getAllTrades(params = {}) {
    const walletAddress = params.walletAddress || this.signerAddress;
    const topicId = params.topicId;

    const allTrades = [];
    let page = 1;
    const limit = 200; // 每页获取100条，减少请求次数

    console.log(`→ Fetching all trades for wallet ${walletAddress}...`);

    while (true) {
      const result = await this.queryTrades({
        walletAddress,
        topicId,
        page,
        limit
      });

      allTrades.push(...result.list);

      // 如果已经获取所有记录，退出循环
      if (allTrades.length >= result.total) {
        break;
      }

      page++;
    }

    console.log(`✓ Fetched total ${allTrades.length} trades`);

    return allTrades;
  }

  /**
   * Calculate profit/loss from trade history (计算历史成交盈亏)
   *
   * 计算逻辑：
   * - 只统计 status=2 的成功交易（status=6 为失败交易，不计入）
   * - Split: 以0.5价格买入 → 净流入 = shares × 0.5
   * - Buy: 按lastPrice买入 → 净流入 = shares × lastPrice
   * - Merge: 以0.5价格卖出 → 净流出 = shares × 0.5
   * - Sell: 按lastPrice卖出 → 净流出 = shares × lastPrice
   * - Fee: 手续费 → 净流入 = fee / 1e18 (USDT计价)
   *
   * 盈亏 = 净流出 - 净流入 - 手续费
   *
   * @param {Array} trades - Trade history array from getAllTrades()
   * @returns {object} Profit/loss summary with details
   */
  calculateProfitLoss(trades) {
    let totalInflow = 0;   // 总流入(买入花费的USDT)
    let totalOutflow = 0;  // 总流出(卖出获得的USDT)
    let totalFees = 0;     // 总手续费(USDT)

    const details = {
      split: { count: 0, amount: 0 },
      buy: { count: 0, amount: 0 },
      merge: { count: 0, amount: 0 },
      sell: { count: 0, amount: 0 }
    };

    let successCount = 0;
    let failedCount = 0;

    trades.forEach(trade => {
      // 只统计 status=2 的成功交易
      // status=6 是失败交易，不计入盈亏
      if (trade.status !== 2) {
        failedCount++;
        return; // 跳过非成功交易
      }

      successCount++;

      const shares = parseFloat(trade.shares || 0);
      const lastPrice = parseFloat(trade.lastPrice || 0);
      const side = trade.side;

      // 计算手续费（fee 字段是 wei 单位，需要除以 1e18）
      const fee = parseFloat(trade.fee || 0) / 1e18;
      totalFees += fee;

      if (side === 'Split') {
        // Split: 以0.5价格买入
        const amount = shares * 0.5;
        totalInflow += amount;
        details.split.count++;
        details.split.amount += amount;
      } else if (side === 'Buy') {
        // Buy: 按lastPrice买入
        const amount = shares * lastPrice;
        totalInflow += amount;
        details.buy.count++;
        details.buy.amount += amount;
      } else if (side === 'Merge') {
        // Merge: 以0.5价格卖出
        const amount = shares * 0.5;
        totalOutflow += amount;
        details.merge.count++;
        details.merge.amount += amount;
      } else if (side === 'Sell') {
        // Sell: 按lastPrice卖出
        const amount = shares * lastPrice;
        totalOutflow += amount;
        details.sell.count++;
        details.sell.amount += amount;
      }
    });

    const profitLoss = totalOutflow - totalInflow - totalFees;

    return {
      totalInflow,    // 总流入(花费)
      totalOutflow,   // 总流出(收入)
      totalFees,      // 总手续费
      profitLoss,     // 盈亏 (正数=盈利，负数=亏损)
      details,        // 各类型明细
      tradeCount: trades.length,      // 总交易笔数
      successCount,   // 成功交易笔数
      failedCount     // 失败交易笔数
    };
  }

  /**
   * Get profit/loss for a topic (获取指定Topic的盈亏统计)
   *
   * @param {object} params
   * @param {string|number} params.topicId - Topic ID
   * @param {string} [params.walletAddress] - Wallet address (default: signer address)
   * @returns {Promise<object>} Profit/loss summary
   */
  async getProfitLoss(params) {
    const { topicId, walletAddress } = params;

    console.log(`→ Calculating profit/loss for Topic ${topicId}...`);

    // 获取所有历史成交
    const trades = await this.getAllTrades({
      walletAddress,
      topicId
    });

    // 计算盈亏
    const result = this.calculateProfitLoss(trades);

    console.log(`✓ Profit/Loss calculated:`);
    console.log(`  Total Inflow (花费): ${result.totalInflow.toFixed(4)} USDT`);
    console.log(`  Total Outflow (收入): ${result.totalOutflow.toFixed(4)} USDT`);
    console.log(`  Total Fees (手续费): ${result.totalFees.toFixed(4)} USDT`);
    console.log(`  Profit/Loss (盈亏): ${result.profitLoss.toFixed(4)} USDT`);

    return result;
  }

  /**
   * Cancel an order (取消订单)
   *
   * @param {object} params
   * @param {string} params.transNo - Transaction number (order ID)
   * @param {number} [params.chainId] - Chain ID (default: 56)
   * @returns {Promise<object>} API response
   */
  async cancelOrder(params) {
    const {
      transNo,
      chainId = this.chainId
    } = params;

    if (!transNo) {
      throw new Error('transNo (order ID) is required');
    }

    try {
      const url = `${this.apiBaseUrl}/v1/order/cancel/order`;
      console.log('\n========== 撤销订单调试信息 ==========');
      console.log('Request URL:', url);
      console.log('Order ID (trans_no):', transNo);
      console.log('Chain ID:', chainId);

      const payload = {
        trans_no: transNo,
        chainId: chainId
      };

      console.log('Request Payload:', JSON.stringify(payload, null, 2));

      if (this.authorizationToken) {
        const token = this.authorizationToken.startsWith('Bearer ')
          ? this.authorizationToken
          : `Bearer ${this.authorizationToken}`;
        console.log('Authorization:', token.substring(0, 20) + '...' + token.substring(token.length - 10));
      } else {
        console.warn('⚠️  WARNING: No authorization token provided. API call may fail.');
      }

      console.log('\n发送请求中...\n');

      const responseData = await this._makeRequest('POST', url, payload);

      console.log('\nParsed Response:', JSON.stringify(responseData, null, 2));
      console.log('✓ Order cancelled successfully');

      return responseData;
    } catch (error) {
      console.error('\n========== 错误信息 ==========');
      console.error('Error Type:', error.constructor.name);
      console.error('Error Message:', error.message);
      if (error.stack) {
        console.error('Stack Trace:', error.stack);
      }
      console.error('================================\n');
      throw error;
    }
  }
}




// Module exports
module.exports = OpinionTradeSDK;
