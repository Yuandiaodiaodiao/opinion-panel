const PanelBase = require('../PanelBase');

/**
 * 输入数量面板
 * 用于输入交易数量和调整价格
 */
class InputPanel extends PanelBase {
  constructor(dashboard) {
    super(dashboard);
  }

  /**
   * 计算字符串的实际显示宽度（中文=2，emoji=2，ASCII=1）
   */
  getDisplayWidth(str) {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      // 中文字符范围
      if ((code >= 0x4E00 && code <= 0x9FFF) ||
          (code >= 0x3000 && code <= 0x303F) ||
          (code >= 0xFF00 && code <= 0xFFEF)) {
        width += 2;
      }
      // Emoji 和其他宽字符（简单检测）
      else if (code > 0x1F000) {
        width += 2;
        // 跳过 surrogate pair 的第二部分
        if (i + 1 < str.length && str.charCodeAt(i + 1) >= 0xDC00 && str.charCodeAt(i + 1) <= 0xDFFF) {
          i++;
        }
      }
      else {
        width += 1;
      }
    }
    return width;
  }

  /**
   * 填充字符串到指定显示宽度
   */
  padToWidth(str, targetWidth) {
    const currentWidth = this.getDisplayWidth(str);
    const padding = Math.max(0, targetWidth - currentWidth);
    return str + ' '.repeat(padding);
  }

  /**
   * 创建居中的标题行
   */
  centerText(text, totalWidth) {
    const textWidth = this.getDisplayWidth(text);
    const leftPad = Math.floor((totalWidth - textWidth) / 2);
    const rightPad = totalWidth - textWidth - leftPad;
    return '│' + ' '.repeat(leftPad) + text + ' '.repeat(rightPad) + '│';
  }

  isVisible(context) {
    return context.interactionMode === 'inputShares';
  }

  render(context) {
    const { currentView, selectedOrderData, inputBuffer, priceAdjustment, submitMessage, autoClearEnabled, autoClearManager } = context;
    const lines = [];
    const BOX_WIDTH = 82; // 内容区域宽度（不含边框）

    lines.push('');
    lines.push('┌─────────────────────────────────────────────────────────────────────────────────┐');
    lines.push(this.centerText('📝 输入交易数量', BOX_WIDTH));
    lines.push('├─────────────────────────────────────────────────────────────────────────────────┤');

    if (selectedOrderData) {
      const sideLabel = selectedOrderData.side === 'ask' ? '卖单' : '买单';
      const actionLabel = selectedOrderData.side === 'ask' ? 'SELL' : 'BUY';
      const basePrice = selectedOrderData.order.price;
      const adjustedPrice = basePrice + (priceAdjustment * 0.001);
      const pricePercent = (adjustedPrice * 100).toFixed(2);

      // 第一行：显示选中的订单信息
      let orderInfoLine;
      if (priceAdjustment !== 0) {
        const adjustmentStr = priceAdjustment > 0 ? `+${priceAdjustment}` : `${priceAdjustment}`;
        orderInfoLine = `  选中: ${currentView} ${sideLabel} @ ${basePrice.toFixed(4)} ${adjustmentStr} tick = ${adjustedPrice.toFixed(4)} (${pricePercent}%)`;
      } else {
        orderInfoLine = `  选中: ${currentView} ${sideLabel} @ ${adjustedPrice.toFixed(4)} (${pricePercent}%)`;
      }
      lines.push('│' + this.padToWidth(orderInfoLine, BOX_WIDTH) + '│');

      // 第二行：操作类型
      const actionLine = `  操作: ${actionLabel} (作为Maker挂单)`;
      lines.push('│' + this.padToWidth(actionLine, BOX_WIDTH) + '│');
      lines.push('│' + ' '.repeat(BOX_WIDTH) + '│');

      // 第三行：输入数量
      const maxAmount = this.calculateMaxAmount(context);
      const inputLine = `  输入Shares数量: ${inputBuffer}_     (最大: ${maxAmount.toFixed(2)})`;
      lines.push('│' + this.padToWidth(inputLine, BOX_WIDTH) + '│');
      lines.push('│' + ' '.repeat(BOX_WIDTH) + '│');

      // 预计成本
      if (inputBuffer && !isNaN(parseFloat(inputBuffer))) {
        const shares = parseFloat(inputBuffer);
        const estimatedCost = (shares * adjustedPrice).toFixed(4);
        const costLine = `  预计成本: ~${estimatedCost} USDT`;
        lines.push('│' + this.padToWidth(costLine, BOX_WIDTH) + '│');
        lines.push('│' + ' '.repeat(BOX_WIDTH) + '│');
      }

      // 显示自动清理选项（仅对买单有效）
      if (selectedOrderData.side === 'bid' && autoClearManager) {
        const checkbox = autoClearEnabled ? '☑' : '☐';
        const optionText = `${checkbox} 成交后反向订单(按TAB切换)`;
        const textDisplayWidth = this.getDisplayWidth(optionText);

        if (autoClearEnabled) {
          // 选中：绿色背景 + 白色文字
          const coloredText = `\x1b[42m\x1b[97m ${optionText} \x1b[0m`;
          const padding = BOX_WIDTH - textDisplayWidth - 4; // -4 for "  " prefix and " " suffix in colored text
          lines.push('│  ' + coloredText + ' '.repeat(padding) + '│');
        } else {
          // 未选中：黄色文字
          const coloredText = `\x1b[33m${optionText}\x1b[0m`;
          const padding = BOX_WIDTH - textDisplayWidth - 2; // -2 for "  " prefix
          lines.push('│  ' + coloredText + ' '.repeat(padding) + '│');
        }
        lines.push('│' + ' '.repeat(BOX_WIDTH) + '│');
      }
    }

    // 帮助文本
    let helpText;
    if (selectedOrderData && selectedOrderData.side === 'bid' && autoClearManager) {
      helpText = '  [↑↓] 价格  [Tab] 自动清理  [M] 最大  [Enter] 确认  [ESC] 取消';
    } else {
      helpText = '  [↑↓] 调整价格(±0.001)  |  [M] 最大数量  |  [Enter] 确认  |  [ESC] 取消';
    }
    lines.push('│' + this.padToWidth(helpText, BOX_WIDTH) + '│');
    lines.push('└─────────────────────────────────────────────────────────────────────────────────┘');

    if (submitMessage) {
      lines.push('');
      lines.push(`  ${submitMessage}`);
    }

    return { lines: lines, width: 84 };
  }

  /**
   * 计算最大可下单数量
   */
  calculateMaxAmount(context) {
    const { previousInventory, selectedOrderData, priceAdjustment, openOrders, currentView, topicInfo } = context;

    if (!previousInventory || !selectedOrderData) {
      return 0;
    }

    const adjustedPrice = selectedOrderData.order.price + (priceAdjustment * 0.001);

    if (selectedOrderData.side === 'bid') {
      // 买入：计算可用USDT / 价格
      const usdtBalance = parseFloat(previousInventory.usdt.formatted);

      let lockedUsdt = 0;
      if (openOrders && openOrders.list) {
        openOrders.list.forEach(order => {
          if (order.side === 1 && order.status === 1 && order.outcome === currentView) {
            const price = parseFloat(order.price);
            const amount = parseFloat(order.amount);
            const filled = parseFloat(order.filled || 0);
            const remaining = amount - filled;
            lockedUsdt += remaining * price;
          }
        });
      }

      const availableUsdt = usdtBalance - lockedUsdt;
      const maxShares = availableUsdt / adjustedPrice;
      return Math.max(0, Math.floor(maxShares * 100) / 100);

    } else {
      // 卖出：计算可用token数量
      const tokenId = currentView === 'YES' ? topicInfo.yesToken : topicInfo.noToken;
      let tokenBalance = 0;

      if (previousInventory.nfts) {
        const nft = previousInventory.nfts.find(n => n.tokenId === tokenId);
        if (nft) {
          tokenBalance = parseFloat(nft.formatted);
        }
      }

      let lockedTokens = 0;
      if (openOrders && openOrders.list) {
        openOrders.list.forEach(order => {
          if (order.side === 2 && order.status === 1 && order.outcome === currentView) {
            const amount = parseFloat(order.amount);
            const filled = parseFloat(order.filled || 0);
            const remaining = amount - filled;
            lockedTokens += remaining;
          }
        });
      }

      const maxTokens = tokenBalance - lockedTokens;
      return Math.max(0, Math.floor(maxTokens * 100) / 100);
    }
  }

  buildGridItems(context) {
    // 输入面板不参与网格选择
    return [];
  }

  getDimensions(context) {
    let height = 10; // 基本行数
    if (context.inputBuffer && !isNaN(parseFloat(context.inputBuffer))) {
      height += 2; // 预计成本行
    }
    if (context.submitMessage) {
      height += 2; // 消息行
    }
    return { width: 84, height };
  }
}

module.exports = InputPanel;
