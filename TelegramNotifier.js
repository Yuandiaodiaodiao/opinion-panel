const { HttpClient } = require('./src/network');

/**
 * Telegram 通知器
 * 用于向指定的 Telegram 聊天发送通知消息
 */
class TelegramNotifier {
  constructor(botToken, chatId) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.enabled = !!(botToken && chatId);

    if (!this.enabled) {
      console.warn('⚠️  Telegram 通知未配置，通知功能已禁用');
    }

    // 创建专用的 HTTP 客户端（不检查 API 错误码，因为 Telegram API 使用不同的格式）
    this.httpClient = new HttpClient({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * 发送文本消息到 Telegram
   * @param {string} message - 要发送的消息文本（支持 Markdown）
   * @param {object} options - 可选参数
   * @param {string} options.parse_mode - 消息格式（Markdown 或 HTML）
   * @returns {Promise<boolean>} 发送是否成功
   */
  async sendMessage(message, options = {}) {
    if (!this.enabled) {
      return false;
    }

    const payload = {
      chat_id: this.chatId,
      text: message,
      parse_mode: options.parse_mode || 'Markdown',
      disable_web_page_preview: options.disable_preview !== false
    };

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      // 使用统一的网络请求客户端，禁用 API 错误检查
      const result = await this.httpClient.post(url, payload, {
        checkApiError: false
      });

      if (result.ok) {
        return true;
      } else {
        console.error('Telegram API 错误:', result.description);
        console.error('错误代码:', result.error_code);
        return false;
      }
    } catch (error) {
      console.error('发送 Telegram 消息失败:', error.message);
      return false;
    }
  }

  /**
   * 发送订单完成通知
   * @param {object} orderInfo - 订单信息
   */
  async notifyOrderFilled(orderInfo) {
    const { orderId, side, outcome, price, amount, filled, title } = orderInfo;

    const message = `
🎉 *订单完成*
${title ? `\n📋 *${title}*\n` : ''}
订单ID: \`${orderId}\`
方向: *${side}*
仓位: *${outcome}*
价格: \`${price}\`
数量: \`${amount}\`
已成交: \`${filled}\`

✅ 订单已完全成交
`.trim();

    return await this.sendMessage(message);
  }

  /**
   * 发送订单移除通知
   * @param {object} orderInfo - 订单信息
   */
  async notifyOrderRemoved(orderInfo) {
    const { orderId, side, outcome, price, amount, filled, title } = orderInfo;

    const message = `
⚠️ *订单移除*
${title ? `\n📋 *${title}*\n` : ''}
订单ID: \`${orderId}\`
方向: *${side}*
仓位: *${outcome}*
价格: \`${price}\`
数量: \`${amount}\`
已成交: \`${filled}\`

🔔 订单已从订单簿移除
`.trim();

    return await this.sendMessage(message);
  }

  /**
   * 发送订单部分成交通知
   * @param {object} orderInfo - 订单信息
   */
  async notifyOrderPartiallyFilled(orderInfo) {
    const { orderId, side, outcome, price, filledAmount, totalFilled, totalAmount, title } = orderInfo;

    const percentage = ((parseFloat(totalFilled) / parseFloat(totalAmount)) * 100).toFixed(1);

    const message = `
📊 *订单部分成交*
${title ? `\n📋 *${title}*\n` : ''}
订单ID: \`${orderId}\`
方向: *${side}*
仓位: *${outcome}*
价格: \`${price}\`

本次成交: \`${filledAmount}\`
总已成交: \`${totalFilled}\` / \`${totalAmount}\` (${percentage}%)

⏳ 订单继续挂单中...
`.trim();

    return await this.sendMessage(message);
  }

  /**
   * 发送自定义通知
   * @param {string} title - 标题
   * @param {string} content - 内容
   * @param {string} emoji - 表情符号（可选）
   */
  async notify(title, content, emoji = '📢') {
    const message = `
${emoji} *${title}*

${content}
`.trim();

    return await this.sendMessage(message);
  }

  /**
   * 测试连接
   * @returns {Promise<boolean>} 测试是否成功
   */
  async test() {
    if (!this.enabled) {
      console.log('Telegram 通知未启用');
      return false;
    }

    console.log('正在测试 Telegram 连接...');
    const success = await this.sendMessage('🤖 Telegram 通知测试\n\n✅ 连接成功！');

    if (success) {
      console.log('✅ Telegram 通知测试成功');
    } else {
      console.log('❌ Telegram 通知测试失败');
    }

    return success;
  }
}

module.exports = TelegramNotifier;
