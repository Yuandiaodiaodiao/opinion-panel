const fs = require('fs').promises;
const path = require('path');
const OpinionTradeSDK = require('./src/sdk/OpinionTradeSDK');
const OrderBookAPI = require('./src/sdk/OrderBookAPI');
const TopicAPI = require('./src/sdk/TopicAPI');

/**
 * 自动库存清理管理器
 * 负责追踪订单并在完全成交后自动挂反向清理单
 */
class AutoClearManager {
  constructor(sdkInstance = null, topicId = null) {
    this.sdk = sdkInstance;
    this.topicAPI = new TopicAPI();
    this.topicId = topicId;
    this.trackedOrders = new Map(); // orderId -> orderInfo

    // 创建存储目录和文件路径
    this.storageDir = path.join(__dirname, '.autoclear_data');
    if (topicId) {
      this.storageFile = path.join(this.storageDir, `topic_${topicId}.json`);
    } else {
      // 兼容旧版本（无 topicId）
      this.storageFile = path.join(__dirname, '.autoclear_tracked.json');
    }

    this.isInitialized = false;
  }

  /**
   * 初始化 - 从文件加载已追踪订单
   */
  async initialize() {
    try {
      // 确保存储目录存在
      if (this.topicId) {
        try {
          await fs.mkdir(this.storageDir, { recursive: true });
        } catch (error) {
          if (error.code !== 'EEXIST') {
            console.error('⚠️  创建存储目录失败:', error.message);
          }
        }
      }

      // 读取追踪订单
      const data = await fs.readFile(this.storageFile, 'utf-8');
      const stored = JSON.parse(data);

      // 恢复 Map
      for (const [orderId, orderInfo] of Object.entries(stored)) {
        this.trackedOrders.set(parseInt(orderId), orderInfo);
      }

      const topicInfo = this.topicId ? ` (Topic ${this.topicId})` : '';
      console.log(`✓ AutoClearManager${topicInfo}: 已加载 ${this.trackedOrders.size} 个追踪订单`);
      this.isInitialized = true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        const topicInfo = this.topicId ? ` (Topic ${this.topicId})` : '';
        console.log(`✓ AutoClearManager${topicInfo}: 初始化（无历史追踪订单）`);
      } else {
        console.error('⚠️  AutoClearManager: 加载追踪订单失败:', error.message);
      }
      this.isInitialized = true;
    }
  }

  /**
   * 持久化保存追踪订单
   */
  async save() {
    try {
      // 将 Map 转换为对象
      const obj = Object.fromEntries(this.trackedOrders);
      await fs.writeFile(this.storageFile, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (error) {
      console.error('⚠️  AutoClearManager: 保存追踪订单失败:', error.message);
    }
  }

  /**
   * 注册订单追踪
   *
   * @param {object} params
   * @param {number} params.orderId - 订单ID
   * @param {string} params.topicId - Topic ID
   * @param {string} params.position - 'YES' 或 'NO'
   * @param {number} params.side - 1=BUY, 2=SELL
   * @param {string} params.price - 成交价格
   * @param {string} params.amount - 订单数量
   */
  async trackOrder(params) {
    const { orderId, topicId, position, side, price, amount } = params;

    const orderInfo = {
      orderId,
      topicId,
      position,
      side,
      price: parseFloat(price),
      amount: parseFloat(amount),
      trackedAt: new Date().toISOString(),
      status: 'pending', // pending | filled | clearing | cleared | error
      errorMessage: null,
      reverseOrderId: null // 反向订单ID
    };

    this.trackedOrders.set(orderId, orderInfo);
    await this.save();

    console.log(`✓ AutoClearManager: 开始追踪订单 #${orderId} (${side === 1 ? 'BUY' : 'SELL'} ${position} @${price})`);

    return orderInfo;
  }

  /**
   * 更新订单状态
   * 由 Dashboard 在刷新时调用，传入最新的订单列表
   *
   * @param {Array} closedOrders - 已完成订单列表（来自 getClosedOrders）
   */
  async updateOrderStatus(closedOrders) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!closedOrders || closedOrders.length === 0) {
      return;
    }

    let hasChanges = false;

    for (const closedOrder of closedOrders) {
      const orderId = closedOrder.orderId;

      if (!this.trackedOrders.has(orderId)) {
        continue; // 不是我们追踪的订单
      }

      const trackedOrder = this.trackedOrders.get(orderId);

      // 检查是否已经处理过
      if (trackedOrder.status !== 'pending') {
        continue;
      }

      // 检查是否完全成交（status=2）
      // filled 字段格式: "USDT金额/USDT金额"
      // amount 字段也是 USDT 金额，需要换算成 shares
      if (closedOrder.status === 2) {
        // 从 filled 字段判断是否真的成交（而不是取消）
        const [filledAmountStr, totalAmountStr] = closedOrder.filled.split('/');
        const filledUsdt = parseFloat(filledAmountStr);
        const totalUsdt = parseFloat(totalAmountStr);

        // 如果 USDT 成交金额接近总金额，说明是完全成交（不是取消）
        if (filledUsdt >= totalUsdt * 0.999) { // 允许0.1%误差
          console.log(`🔔 订单 #${orderId} 完全成交！准备清理库存...`);

          // 计算实际的 shares 数量：USDT 金额 / 价格
          const priceDecimal = trackedOrder.price / 100; // 转换为小数格式（90.00 -> 0.90）
          const sharesAmount = filledUsdt / priceDecimal;

          trackedOrder.status = 'filled';
          trackedOrder.filledAt = new Date().toISOString();
          trackedOrder.filledShares = sharesAmount; // 存储 shares 数量
          trackedOrder.filledUsdt = filledUsdt; // 存储 USDT 金额
          hasChanges = true;

          console.log(`  成交数量: ${sharesAmount.toFixed(4)} shares (${filledUsdt.toFixed(4)} USDT @ ${priceDecimal.toFixed(4)})`);

          // 触发反向挂单
          await this.createReverseClearOrder(trackedOrder);
        } else {
          // 订单被取消或部分取消
          console.log(`⚠️  订单 #${orderId} 未完全成交 (${filledUsdt.toFixed(4)}/${totalUsdt.toFixed(4)} USDT)，跳过清理`);
        }
      }
    }

    if (hasChanges) {
      await this.save();
    }
  }

  /**
   * 创建反向清理订单
   *
   * @param {object} trackedOrder - 追踪的订单信息
   */
  async createReverseClearOrder(trackedOrder) {
    try {
      trackedOrder.status = 'clearing';
      await this.save();

      const { topicId, position, side, price: costPricePercent, filledShares } = trackedOrder;

      // 只有买单成交后才需要清理（卖出库存）
      if (side !== 1) {
        console.log(`⚠️  订单 #${trackedOrder.orderId} 是卖单，无需清理库存`);
        trackedOrder.status = 'cleared';
        await this.save();
        return;
      }

      // 检查是否有成交数量
      if (!filledShares || filledShares <= 0) {
        throw new Error('成交数量无效');
      }

      // 将百分比格式价格转换为小数格式（90.00 -> 0.90）
      const costPrice = costPricePercent / 100;

      // 获取当前盘口
      const topicInfo = await this.topicAPI.getTopicInfo(topicId);
      const orderBookConfig = await this.topicAPI.getOrderBookConfig(topicId);
      const orderBookAPI = new OrderBookAPI(orderBookConfig);

      const orderBook = await orderBookAPI.getOrderBook(position);

      if (orderBook.error || !orderBook.bids || !orderBook.asks) {
        throw new Error(`无法获取订单簿: ${orderBook.error || '数据缺失'}`);
      }

      // 计算清理价格（传入小数格式）
      const clearPrice = this.calculateClearPrice(costPrice, orderBook);

      if (!clearPrice) {
        throw new Error('无法计算安全的清理价格（盘口异常）');
      }

      console.log(`📊 清理价格计算：成本=${costPrice.toFixed(4)}, 买1=${orderBook.bids[0]?.price.toFixed(4)}, 卖1=${orderBook.asks[0]?.price.toFixed(4)} → 目标=${clearPrice.toFixed(4)}`);

      // 挂反向清理单（卖出）- 使用实际成交的 shares 数量
      const result = await this.sdk.sellByTopic({
        topicId,
        position,
        limitPrice: (clearPrice * 100).toFixed(2), // 转换为百分比格式
        shares: filledShares.toFixed(4)
      });

      trackedOrder.status = 'cleared';
      trackedOrder.reverseOrderId = result.result?.orderData?.orderId || null;
      trackedOrder.reversePrice = clearPrice;
      trackedOrder.reverseShares = filledShares;
      trackedOrder.clearedAt = new Date().toISOString();

      console.log(`✅ 清理订单已提交！订单ID: ${trackedOrder.reverseOrderId}, 价格: ${clearPrice.toFixed(4)}, 数量: ${filledShares.toFixed(4)} shares`);

    } catch (error) {
      console.error(`❌ 创建清理订单失败:`, error.message);
      trackedOrder.status = 'error';
      trackedOrder.errorMessage = error.message;
    } finally {
      await this.save();
    }
  }

  /**
   * 计算清理价格
   *
   * @param {number} costPrice - 成本价格
   * @param {object} orderBook - 订单簿数据
   * @returns {number|null} 清理价格，如果无法安全挂单则返回 null
   */
  calculateClearPrice(costPrice, orderBook) {
    if (!orderBook.bids || orderBook.bids.length === 0) {
      console.error('❌ 无买单，无法计算清理价格');
      return null;
    }

    if (!orderBook.asks || orderBook.asks.length === 0) {
      console.error('❌ 无卖单，无法计算清理价格');
      return null;
    }

    const bestBid = orderBook.bids[0].price; // 买1
    const bestAsk = orderBook.asks[0].price; // 卖1
    const spread = bestAsk - bestBid;

    // 1. 计算基础目标价
    let targetPrice;
    if (spread > 0.1) {
      targetPrice = bestAsk - 0.1; // 点差大于0.1，降一档
    } else {
      targetPrice = bestAsk; // 否则直接挂卖1
    }

    // 2. 应用成本保护（不能亏本）
    targetPrice = Math.max(targetPrice, costPrice);

    // 3. 最终安全检查（确保不会挂到买盘上变成市价成交）
    if (targetPrice <= bestBid) {
      console.error(`❌ 计算的清理价格 ${targetPrice.toFixed(4)} <= 买1 ${bestBid.toFixed(4)}，无法安全挂单`);
      return null;
    }

    // 4. 精度修正（保留3位小数）
    targetPrice = Math.round(targetPrice * 1000) / 1000;

    return targetPrice;
  }

  /**
   * 获取所有追踪订单
   *
   * @returns {Array} 追踪订单列表
   */
  getTrackedOrders() {
    return Array.from(this.trackedOrders.values());
  }

  /**
   * 获取指定状态的追踪订单
   *
   * @param {string} status - 订单状态
   * @returns {Array} 过滤后的订单列表
   */
  getOrdersByStatus(status) {
    return this.getTrackedOrders().filter(order => order.status === status);
  }

  /**
   * 移除追踪订单
   *
   * @param {number} orderId - 订单ID
   */
  async removeTrackedOrder(orderId) {
    if (this.trackedOrders.has(orderId)) {
      this.trackedOrders.delete(orderId);
      await this.save();
      console.log(`✓ 已移除追踪订单 #${orderId}`);
      return true;
    }
    return false;
  }

  /**
   * 清空所有追踪订单
   */
  async clearAll() {
    this.trackedOrders.clear();
    await this.save();
    console.log('✓ 已清空所有追踪订单');
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const orders = this.getTrackedOrders();
    return {
      total: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      filled: orders.filter(o => o.status === 'filled').length,
      clearing: orders.filter(o => o.status === 'clearing').length,
      cleared: orders.filter(o => o.status === 'cleared').length,
      error: orders.filter(o => o.status === 'error').length
    };
  }
}

module.exports = AutoClearManager;
