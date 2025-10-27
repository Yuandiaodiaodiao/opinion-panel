const PanelBase = require('../PanelBase');

/**
 * 我的订单面板
 * 显示当前未完成的订单
 */
class MyOrdersPanel extends PanelBase {
  constructor(dashboard) {
    super(dashboard);
  }

  isVisible(context) {
    return context.sdkEnabled && !context.isInteractionMode;
  }

  render(context) {
    const { openOrders, gridManager } = context;
    const lines = [];

    lines.push('我的订单');

    if (!openOrders) {
      lines.push('加载中...');
      return { lines, width: 40 };
    }

    if (openOrders.error) {
      lines.push(`\x1b[31m查询失败: ${openOrders.error}\x1b[0m`);
      return { lines, width: 40 };
    }

    if (openOrders.list.length === 0) {
      lines.push('暂无未完成订单');
      return { lines, width: 40 };
    }

    const sortedOrders = [...openOrders.list].sort((a, b) => {
      const priceA = parseFloat(a.price || 0);
      const priceB = parseFloat(b.price || 0);
      return priceB - priceA;
    });

    lines.push('方向 仓位   价格     价值    已成交');
    lines.push('─'.repeat(36));

    let lineY = 0;
    const cursorPos = gridManager.getCursorPosition();

    sortedOrders.forEach((order, index) => {
      const sideLabel = order.side === 1 ? 'BUY' : 'SEL';
      const sideColor = order.side === 1 ? '\x1b[32m' : '\x1b[31m';
      const outcome = (order.outcome || 'N/A').substring(0, 3);
      const priceValue = order.price ? parseFloat(order.price) : 0;
      const price = priceValue ? priceValue.toFixed(3) : 'N/A';

      // BUY单的amount是USDT计价，SELL单的amount是shares计价，需要转换为USDT
      let amount;
      if (order.amount) {
        const amountValue = parseFloat(order.amount);
        if (order.side === 1) {
          // BUY单：已经是USDT计价
          amount = amountValue.toFixed(2);
        } else {
          // SELL单：shares * price = USDT价值
          amount = (amountValue * priceValue).toFixed(2);
        }
      } else {
        amount = 'N/A';
      }

      const filled = order.filled ? parseFloat(order.filled).toFixed(2) : '0';

      const isSelected = cursorPos.x === 1 && cursorPos.y === lineY;
      const lineContent = `${sideColor}${sideLabel}\x1b[0m ${outcome.padEnd(3)} ${price.padStart(8)} ${amount.padStart(8)} ${filled.padStart(8)}`;

      if (isSelected) {
        lines.push(`\x1b[7m${lineContent}\x1b[0m`);
      } else {
        lines.push(lineContent);
      }

      lineY++;
    });

    return { lines, width: 40 };
  }

  buildGridItems(context) {
    const { openOrders, selectMyOrder } = context;
    const items = [];

    if (!openOrders || !openOrders.list || openOrders.list.length === 0) {
      return items;
    }

    const sortedOrders = [...openOrders.list].sort((a, b) => {
      const priceA = parseFloat(a.price || 0);
      const priceB = parseFloat(b.price || 0);
      return priceB - priceA;
    });

    let y = 0;
    sortedOrders.forEach((order, index) => {
      items.push({
        x: 1,
        y: y,
        type: 'my_order',
        data: { order, index },
        renderData: order,
        onSelect: () => selectMyOrder(order)
      });
      y++;
    });

    return items;
  }

  getDimensions(context) {
    const { openOrders } = context;
    let height = 1; // 标题

    if (!openOrders || openOrders.error) {
      height += 1;
    } else if (openOrders.list.length === 0) {
      height += 1;
    } else {
      height += 2 + openOrders.list.length; // 表头 + 分隔符 + 订单行
    }

    return { width: 40, height };
  }
}

module.exports = MyOrdersPanel;
