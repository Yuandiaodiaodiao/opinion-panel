const { defaultClient } = require('../network');

/**
 * 订单簿API管理类
 */
class OrderBookAPI {
  /**
   * @param {Object} config - 配置对象（必需）
   * @param {string} config.questionId - Question ID
   * @param {Object} config.tokens - Token配置 {YES: string, NO: string}
   * @param {string} config.chainId - Chain ID (默认56)
   * @param {string} config.title - Topic标题 (可选)
   */
  constructor(config) {
    this.baseUrl = 'https://proxy.opinion.trade:8443/api/bsc/api/v2/order/market/depth';

    if (!config) {
      throw new Error('OrderBookAPI requires a config object. Use TopicAPI.getOrderBookConfig(topicId) to get the config.');
    }

    if (!config.questionId || !config.tokens) {
      throw new Error('OrderBookAPI config must include questionId and tokens');
    }

    // 使用传入的配置
    this.questionId = config.questionId;
    this.tokens = config.tokens;
    this.chainId = config.chainId || '56';
    this.title = config.title || '';
  }

  /**
   * 获取订单簿数据
   * @param {string} type - 'YES' 或 'NO'
   * @returns {Object} 订单簿数据
   */
  async getOrderBook(type) {
    try {
      const symbolType = type === 'YES' ? '0' : '1';
      const symbol = this.tokens[type];

      const url = `${this.baseUrl}?symbol_types=${symbolType}&question_id=${this.questionId}&symbol=${symbol}&chainId=${this.chainId}`;

      // 使用统一的网络请求客户端
      const data = await defaultClient.get(url, { timeout: 10000 });

      return this.parseOrderBook(data, type);
    } catch (error) {
      console.error(`获取${type}订单簿失败:`, error.message);
      return {
        type: type,
        error: error.message,
        bids: [],
        asks: [],
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 解析订单簿数据
   * @param {Object} data - API返回的原始数据
   * @param {string} type - 'YES' 或 'NO'
   * @returns {Object} 解析后的订单簿
   */
  parseOrderBook(data, type) {
    const orderBook = {
      type: type,
      bids: [],  // 买单（bid价格）
      asks: [],  // 卖单（ask价格）
      timestamp: new Date().toISOString(),
      lastPrice: '0'
    };

    // API返回的数据结构: { errno, errmsg, result: { bids, asks, ... } }
    const result = data.result || data.data || data;

    // 解析买单并按价格从高到低排序
    if (result && result.bids) {
      orderBook.bids = result.bids.map(bid => ({
        price: parseFloat(bid[0]),       // 价格
        amount: parseFloat(bid[1]),      // 数量
        total: parseFloat(bid[0]) * parseFloat(bid[1])  // 总价值
      })).sort((a, b) => b.price - a.price);  // 买单：价格从高到低
    }

    // 解析卖单并按价格从低到高排序
    if (result && result.asks) {
      orderBook.asks = result.asks.map(ask => ({
        price: parseFloat(ask[0]),       // 价格
        amount: parseFloat(ask[1]),      // 数量
        total: parseFloat(ask[0]) * parseFloat(ask[1])  // 总价值
      })).sort((a, b) => a.price - b.price);  // 卖单：价格从低到高
    }

    // 解析最后成交价
    if (result && result.last_price) {
      orderBook.lastPrice = result.last_price;
    }

    return orderBook;
  }

  /**
   * 同时获取YES和NO的订单簿
   * @returns {Object} 包含YES和NO的订单簿数据
   */
  async getBothOrderBooks() {
    const [yesBook, noBook] = await Promise.all([
      this.getOrderBook('YES'),
      this.getOrderBook('NO')
    ]);

    return {
      YES: yesBook,
      NO: noBook
    };
  }
}

module.exports = OrderBookAPI;
