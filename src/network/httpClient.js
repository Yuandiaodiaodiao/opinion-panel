const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { defaultMonitor } = require('./NetworkPerformance');

/**
 * HTTP 客户端配置
 */
class HttpClient {
  constructor(config = {}) {
    this.defaultTimeout = config.timeout || 10000;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...config.headers
    };

    // 代理配置
    this.proxyEnabled = !!process.env.HTTPS_PROXY;
    if (this.proxyEnabled) {
      this.httpsAgent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
    }
  }

  /**
   * 发送 HTTP 请求
   * @param {string} url - 请求 URL
   * @param {object} options - 请求选项
   * @param {string} options.method - HTTP 方法 (GET, POST, etc.)
   * @param {object} [options.data] - 请求体数据
   * @param {object} [options.headers] - 自定义请求头
   * @param {number} [options.timeout] - 超时时间（毫秒）
   * @param {boolean} [options.checkApiError] - 是否检查 API 错误代码（默认 true）
   * @returns {Promise<object>} 响应数据
   */
  async request(url, options = {}) {
    const {
      method = 'GET',
      data = null,
      headers = {},
      timeout = this.defaultTimeout,
      checkApiError = true
    } = options;

    try {
      // 记录请求到性能监控
      defaultMonitor.recordRequest(url);

      const config = {
        method,
        url,
        timeout,
        headers: {
          ...this.defaultHeaders,
          ...headers
        }
      };

      if (data) {
        config.data = data;
      }

      // 添加代理支持
      if (this.proxyEnabled) {
        config.httpsAgent = this.httpsAgent;
        config.proxy = false;
      }

      const response = await axios(config);

      // 检查 API 错误代码（opinion.trade API 约定）
      if (checkApiError && response.data.errno !== undefined && response.data.errno !== 0) {
        throw new ApiError(
          response.data.errno,
          response.data.errmsg || 'Unknown API error'
        );
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error.response) {
        throw new HttpError(
          error.response.status,
          error.response.statusText,
          error.response.data
        );
      } else if (error.request) {
        throw new NetworkError(`No response from server: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * GET 请求
   */
  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  /**
   * POST 请求
   */
  async post(url, data, options = {}) {
    return this.request(url, { ...options, method: 'POST', data });
  }

  /**
   * PUT 请求
   */
  async put(url, data, options = {}) {
    return this.request(url, { ...options, method: 'PUT', data });
  }

  /**
   * DELETE 请求
   */
  async delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  }
}

/**
 * API 错误类
 */
class ApiError extends Error {
  constructor(errno, message) {
    super(`API error (errno: ${errno}): ${message}`);
    this.name = 'ApiError';
    this.errno = errno;
  }
}

/**
 * HTTP 错误类
 */
class HttpError extends Error {
  constructor(status, statusText, data) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

/**
 * 网络错误类
 */
class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * 创建默认的 HTTP 客户端实例
 */
const defaultClient = new HttpClient();

/**
 * 便捷函数：发送 HTTP 请求（向后兼容）
 * @deprecated 建议直接使用 HttpClient 实例
 */
async function makeHttpRequest(url, options = {}) {
  return defaultClient.request(url, options);
}

module.exports = {
  HttpClient,
  ApiError,
  HttpError,
  NetworkError,
  defaultClient,
  makeHttpRequest,
  networkMonitor: defaultMonitor
};
