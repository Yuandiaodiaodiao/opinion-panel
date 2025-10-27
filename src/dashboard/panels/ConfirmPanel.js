const PanelBase = require('../PanelBase');

/**
 * 确认订单面板
 * 显示订单详情并确认提交
 */
class ConfirmPanel extends PanelBase {
  constructor(dashboard) {
    super(dashboard);
  }

  isVisible(context) {
    return context.interactionMode === 'confirm' || context.interactionMode === 'submitting';
  }

  render(context) {
    const { topicId, currentView, selectedOrderData, priceAdjustment, inputBuffer, interactionMode, submitMessage, autoClearEnabled, autoClearManager } = context;
    const lines = [];

    lines.push('');
    lines.push('┌─────────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                              ✅ 确认订单信息                                      │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────────┤');

    if (selectedOrderData) {
      const actionLabel = selectedOrderData.side === 'ask' ? 'SELL (卖出)' : 'BUY (买入)';
      const adjustedPrice = selectedOrderData.order.price + (priceAdjustment * 0.001);
      const pricePercent = (adjustedPrice * 100).toFixed(2);
      const shares = parseFloat(inputBuffer);
      const totalValue = (shares * adjustedPrice).toFixed(4);

      lines.push(`│  Topic ID: ${topicId}`.padEnd(84) + '│');
      lines.push(`│  Position: ${currentView}`.padEnd(84) + '│');
      lines.push(`│  操作: ${actionLabel}`.padEnd(84) + '│');
      lines.push('│'.padEnd(84) + '│');

      if (priceAdjustment !== 0) {
        const adjustmentStr = priceAdjustment > 0 ? `+${priceAdjustment}` : `${priceAdjustment}`;
        lines.push(`│  价格: ${adjustedPrice.toFixed(4)} (${pricePercent}%) [原价${selectedOrderData.order.price.toFixed(4)} ${adjustmentStr}tick]`.padEnd(108) + '│');
      } else {
        lines.push(`│  价格: ${adjustedPrice.toFixed(4)} (${pricePercent}%)`.padEnd(84) + '│');
      }

      lines.push(`│  数量: ${shares.toFixed(4)} shares`.padEnd(84) + '│');
      lines.push(`│  总价值: ${totalValue} USDT`.padEnd(84) + '│');
      lines.push('│'.padEnd(84) + '│');

      // 显示自动清理状态（仅对买单有效）
      if (selectedOrderData.side === 'bid' && autoClearManager) {
        let statusLine;
        if (autoClearEnabled) {
          // 启用：绿色背景 + 白色文字
          statusLine = `│  \x1b[42m\x1b[97m ✅ 成交后反向订单: 已启用 \x1b[0m`;
          const padding = 82 - 21; // 显示宽度
          lines.push(statusLine + ' '.repeat(padding) + '│');
        } else {
          // 未启用：灰色文字
          statusLine = `│  \x1b[90m❌ 成交后反向订单: 未启用\x1b[0m`;
          const padding = 82 - 20;
          lines.push(statusLine + ' '.repeat(padding) + '│');
        }
        lines.push('│'.padEnd(84) + '│');
      }

      if (interactionMode === 'submitting') {
        lines.push('│  📤 提交订单中，请稍候...'.padEnd(84) + '│');
      } else {
        lines.push('│  [Enter] 提交订单  |  [ESC] 返回修改'.padEnd(84) + '│');
      }
    }

    lines.push('└─────────────────────────────────────────────────────────────────────────────────┘');

    if (submitMessage) {
      lines.push('');
      lines.push(`  ${submitMessage}`);
    }

    return { lines, width: 84 };
  }

  buildGridItems(context) {
    // 确认面板不参与网格选择
    return [];
  }

  getDimensions(context) {
    let height = 13; // 基本行数
    if (context.priceAdjustment !== 0) {
      height += 1; // 价格调整说明行
    }
    if (context.submitMessage) {
      height += 2; // 消息行
    }
    return { width: 84, height };
  }
}

module.exports = ConfirmPanel;
