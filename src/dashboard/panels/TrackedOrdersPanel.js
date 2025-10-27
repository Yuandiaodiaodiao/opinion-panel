const PanelBase = require('../PanelBase');

/**
 * 追踪订单面板
 * 显示自动清理追踪的订单
 */
class TrackedOrdersPanel extends PanelBase {
  constructor(dashboard) {
    super(dashboard);
  }

  isVisible(context) {
    return context.autoClearManager && context.showTrackedOrders && !context.isInteractionMode;
  }

  render(context) {
    const { autoClearManager } = context;
    const lines = [];

    const trackedOrders = autoClearManager.getTrackedOrders();
    const stats = autoClearManager.getStats();

    lines.push('');
    lines.push('┌─────────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                              🔍 自动清理追踪订单                                  │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────────┤');

    if (trackedOrders.length === 0) {
      lines.push('│  暂无追踪订单'.padEnd(84) + '│');
    } else {
      lines.push(`│  总计: ${stats.total} | 待成交: ${stats.pending} | 已成交: ${stats.filled} | 清理中: ${stats.clearing} | 已清理: ${stats.cleared} | 错误: ${stats.error}`.padEnd(114) + '│');
      lines.push('│'.padEnd(84) + '│');

      lines.push('│  订单ID'.padEnd(15) + '状态'.padEnd(10) + '仓位'.padEnd(8) + '成本价'.padEnd(12) + '数量'.padEnd(12) + '清理价'.padEnd(12) + '反向ID'.padEnd(15) + '│');
      lines.push('├─────────────────────────────────────────────────────────────────────────────────┤');

      const recentOrders = trackedOrders.slice(-10).reverse();

      recentOrders.forEach(order => {
        const orderIdStr = order.orderId.toString().substring(0, 10);
        const statusColor = {
          pending: '\x1b[33m',
          filled: '\x1b[36m',
          clearing: '\x1b[35m',
          cleared: '\x1b[32m',
          error: '\x1b[31m'
        }[order.status] || '';
        const statusLabel = {
          pending: '待成交',
          filled: '已成交',
          clearing: '清理中',
          cleared: '已清理',
          error: '错误'
        }[order.status] || order.status;

        const position = order.position || 'N/A';
        const costPrice = order.price ? order.price.toFixed(2) : 'N/A';
        const amount = order.amount ? order.amount.toFixed(2) : 'N/A';
        const reversePrice = order.reversePrice ? order.reversePrice.toFixed(4) : '-';
        const reverseId = order.reverseOrderId ? order.reverseOrderId.toString().substring(0, 10) : '-';

        lines.push(`│  ${orderIdStr.padEnd(13)}${statusColor}${statusLabel}\x1b[0m`.padEnd(21) + `${position.padEnd(6)}${costPrice.padStart(10)}  ${amount.padStart(10)}  ${reversePrice.padStart(10)}  ${reverseId.padEnd(13)}│`);

        if (order.status === 'error' && order.errorMessage) {
          const errorMsg = order.errorMessage.substring(0, 70);
          lines.push(`│    \x1b[31m错误: ${errorMsg}\x1b[0m`.padEnd(96) + '│');
        }
      });
    }

    lines.push('└─────────────────────────────────────────────────────────────────────────────────┘');

    return { lines, width: 84 };
  }

  buildGridItems(context) {
    // 追踪订单面板不参与网格选择
    return [];
  }

  getDimensions(context) {
    const { autoClearManager } = context;
    const trackedOrders = autoClearManager.getTrackedOrders();

    let height = 4; // 边框和标题

    if (trackedOrders.length === 0) {
      height += 1;
    } else {
      height += 3; // 统计行 + 空行 + 表头
      height += 1; // 分隔符
      const recentOrders = trackedOrders.slice(-10);
      recentOrders.forEach(order => {
        height += 1; // 订单行
        if (order.status === 'error' && order.errorMessage) {
          height += 1; // 错误消息行
        }
      });
    }

    height++; // 底部边框

    return { width: 84, height };
  }
}

module.exports = TrackedOrdersPanel;
