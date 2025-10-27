/**
 * 网络性能监控模块
 * 记录 API 请求频率，计算 QPS（每秒查询数）
 */
class NetworkPerformance {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 10000; // 滚动窗口大小（毫秒），默认10秒
    this.targetDomain = options.targetDomain || 'proxy.opinion.trade';

    // 存储请求时间戳的数组
    this.requestTimestamps = [];
  }

  /**
   * 记录一次请求
   * @param {string} url - 请求的 URL
   */
  recordRequest(url) {
    // 检查是否是目标域名
    if (!url.includes(this.targetDomain)) {
      return;
    }

    const now = Date.now();
    this.requestTimestamps.push(now);

    // 清理过期的时间戳（超过窗口大小的）
    this.cleanup(now);
  }

  /**
   * 清理过期的时间戳
   * @param {number} now - 当前时间戳
   */
  cleanup(now) {
    const cutoff = now - this.windowSize;

    // 移除所有早于窗口开始时间的时间戳
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }
  }

  /**
   * 计算当前 QPS（每秒查询数）
   * @returns {number} 当前 QPS，保留2位小数
   */
  getQPS() {
    const now = Date.now();
    this.cleanup(now);

    // 如果没有请求，返回0
    if (this.requestTimestamps.length === 0) {
      return 0;
    }

    // 计算实际的时间窗口（秒）
    // 如果请求数量较少，使用实际跨度而不是完整的窗口大小
    const oldestTimestamp = this.requestTimestamps[0];
    const actualWindow = (now - oldestTimestamp) / 1000; // 转换为秒

    // 如果时间窗口太小（小于1秒），使用1秒作为最小窗口
    const window = Math.max(actualWindow, 1);

    // QPS = 请求数 / 时间窗口（秒）
    const qps = this.requestTimestamps.length / window;

    return parseFloat(qps.toFixed(2));
  }

  /**
   * 获取窗口内的请求总数
   * @returns {number}
   */
  getRequestCount() {
    const now = Date.now();
    this.cleanup(now);
    return this.requestTimestamps.length;
  }

  /**
   * 重置所有统计数据
   */
  reset() {
    this.requestTimestamps = [];
  }
}

/**
 * 创建默认的性能监控实例
 */
const defaultMonitor = new NetworkPerformance();

module.exports = {
  NetworkPerformance,
  defaultMonitor
};
