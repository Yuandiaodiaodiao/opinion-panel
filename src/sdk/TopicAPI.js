const fs = require('fs/promises');
const path = require('path');
const { defaultClient } = require('../network');

/**
 * Topic API管理类
 * 用于获取预测市场topic信息并缓存到本地
 */
class TopicAPI {
  constructor(cacheDir = path.join(__dirname, '../../.cache/topics')) {
    this.baseUrl = 'https://proxy.opinion.trade:8443/api/bsc/api/v2/topic';
    this.cacheDir = cacheDir;
  }

  /**
   * 确保缓存目录存在
   */
  async ensureCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('创建缓存目录失败:', error.message);
    }
  }

  /**
   * 获取缓存文件路径
   * @param {string|number} topicId - Topic ID
   * @returns {string} 缓存文件路径
   */
  getCachePath(topicId) {
    return path.join(this.cacheDir, `topic_${topicId}.json`);
  }

  /**
   * 从缓存读取topic信息
   * @param {string|number} topicId - Topic ID
   * @returns {Object|null} 缓存的topic信息，如果不存在返回null
   */
  async loadFromCache(topicId) {
    try {
      const cachePath = this.getCachePath(topicId);
      const content = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(content);

      // 检查缓存是否过期（24小时）
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24小时

      if (cacheAge < maxAge) {
        console.log(`✓ 从缓存加载 Topic ${topicId}`);
        return cached.data;
      } else {
        console.log(`! Topic ${topicId} 缓存已过期，重新获取`);
        return null;
      }
    } catch (error) {
      // 缓存不存在或读取失败
      return null;
    }
  }

  /**
   * 保存topic信息到缓存
   * @param {string|number} topicId - Topic ID
   * @param {Object} data - Topic信息
   */
  async saveToCache(topicId, data) {
    try {
      await this.ensureCacheDir();
      const cachePath = this.getCachePath(topicId);
      const cached = {
        timestamp: Date.now(),
        topicId: topicId,
        data: data
      };
      await fs.writeFile(cachePath, JSON.stringify(cached, null, 2), 'utf-8');
      console.log(`✓ Topic ${topicId} 已缓存到本地`);
    } catch (error) {
      console.error(`保存缓存失败:`, error.message);
    }
  }

  /**
   * 根据topicId获取topic详情（带缓存）
   * @param {string|number} topicId - Topic ID
   * @param {boolean} forceRefresh - 是否强制刷新（忽略缓存）
   * @returns {Object} Topic信息
   */
  async getTopicInfo(topicId, forceRefresh = false) {
    // 如果不强制刷新，先尝试从缓存读取
    if (!forceRefresh) {
      const cached = await this.loadFromCache(topicId);
      if (cached) {
        return cached;
      }
    }

    try {
      const url = `${this.baseUrl}/${topicId}`;
      console.log(`→ 从API获取 Topic ${topicId}...`);

      // 使用统一的网络请求客户端
      const data = await defaultClient.get(url, { timeout: 10000 });
      const topicInfo = this.parseTopicInfo(data);

      // 保存到缓存
      await this.saveToCache(topicId, topicInfo);

      return topicInfo;
    } catch (error) {
      console.error(`获取Topic ${topicId}失败:`, error.message);
      throw error;
    }
  }

  /**
   * 解析topic信息
   * @param {Object} data - API返回的原始数据
   * @returns {Object} 解析后的topic信息
   */
  parseTopicInfo(data) {
    const result = data.result || data.data || data;

    if (!result || !result.data) {
      throw new Error('无效的topic数据');
    }

    const topicData = result.data;

    // 提取关键信息
    const topicInfo = {
      topicId: topicData.topicId,
      title: topicData.title,
      status: topicData.status,
      chainId: topicData.chainId,

      // Question ID (用于查询订单簿)
      questionId: topicData.questionId,

      // Token IDs
      yesToken: topicData.yesPos,
      noToken: topicData.noPos || this.calculateNoToken(topicData.yesPos),

      // 价格信息
      yesPrice: topicData.yesMarketPrice,
      noPrice: topicData.noMarketPrice,

      // 其他信息
      volume: topicData.volume,
      totalPrice: topicData.totalPrice,
      cutoffTime: topicData.cutoffTime,

      // 原始数据（保留以备需要）
      raw: topicData
    };

    return topicInfo;
  }

  /**
   * 尝试计算NO token ID
   * 如果API没有返回noPos，尝试根据yesPos推算
   * 注意：这是一个假设性的实现，可能需要根据实际情况调整
   */
  calculateNoToken(yesToken) {
    // 如果API没有提供NO token，返回null
    // 在实际使用中，可能需要通过其他方式获取
    return null;
  }

  /**
   * 获取用于订单簿查询的配置
   * @param {string|number} topicId - Topic ID
   * @returns {Object} 订单簿查询配置
   */
  async getOrderBookConfig(topicId) {
    const topicInfo = await this.getTopicInfo(topicId);

    if (!topicInfo.noToken) {
      console.warn('警告: NO token ID 未找到，可能需要额外的API调用');
    }

    return {
      questionId: topicInfo.questionId,
      tokens: {
        YES: topicInfo.yesToken,
        NO: topicInfo.noToken
      },
      chainId: topicInfo.chainId,
      title: topicInfo.title
    };
  }

  /**
   * 清除指定topic的缓存
   * @param {string|number} topicId - Topic ID
   */
  async clearCache(topicId) {
    try {
      const cachePath = this.getCachePath(topicId);
      await fs.unlink(cachePath);
      console.log(`✓ Topic ${topicId} 缓存已清除`);
    } catch (error) {
      // 文件不存在或删除失败，忽略错误
    }
  }

  /**
   * 清除所有缓存
   */
  async clearAllCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (file.startsWith('topic_') && file.endsWith('.json')) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }
      console.log('✓ 所有Topic缓存已清除');
    } catch (error) {
      console.error('清除缓存失败:', error.message);
    }
  }

  /**
   * 列出所有缓存的topics
   */
  async listCachedTopics() {
    try {
      const files = await fs.readdir(this.cacheDir);
      const topics = [];

      for (const file of files) {
        if (file.startsWith('topic_') && file.endsWith('.json')) {
          const cachePath = path.join(this.cacheDir, file);
          const content = await fs.readFile(cachePath, 'utf-8');
          const cached = JSON.parse(content);
          topics.push({
            topicId: cached.topicId,
            title: cached.data.title,
            timestamp: new Date(cached.timestamp).toISOString(),
            age: Math.floor((Date.now() - cached.timestamp) / (1000 * 60)) // 分钟
          });
        }
      }

      return topics;
    } catch (error) {
      return [];
    }
  }
}




// Module exports
module.exports = TopicAPI;
