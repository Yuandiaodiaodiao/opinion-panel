const PanelBase = require('../PanelBase');

/**
 * 事件历史面板
 * 显示交易事件历史（虚拟滚动）
 */
class EventHistoryPanel extends PanelBase {
  constructor(dashboard) {
    super(dashboard);
    this.eventsViewportSize = 15;
  }

  isVisible(context) {
    return !context.isInteractionMode;
  }

  render(context) {
    const { eventHistory, openOrders, gridManager } = context;
    const lines = [];

    lines.push('');
    lines.push('事件历史');

    if (eventHistory.length === 0) {
      lines.push('暂无事件记录');
      return { lines, width: 58 };
    }

    // 找到第一个我的订单之后的行号
    let startY = 0;
    if (openOrders && openOrders.list) {
      startY = openOrders.list.length;
    }

    const cursorPos = gridManager.getCursorPosition();

    // 虚拟滚动：如果光标在事件历史区域，以光标为中心渲染
    let visibleEvents;
    if (cursorPos.x === 1 && cursorPos.y >= startY) {
      // 网格偏移量（0=最新，length-1=最旧）
      const gridYOffset = cursorPos.y - startY;
      // 转换为 eventHistory 数组索引（0=最旧，length-1=最新）
      const centerIndexInArray = eventHistory.length - 1 - gridYOffset;
      const halfViewport = Math.floor(this.eventsViewportSize / 2);
      const startIndex = Math.max(0, Math.min(
        eventHistory.length - this.eventsViewportSize,
        centerIndexInArray - halfViewport
      ));
      const endIndex = Math.min(eventHistory.length, startIndex + this.eventsViewportSize);
      visibleEvents = eventHistory.slice(startIndex, endIndex);
    } else {
      // 否则显示最新的事件
      visibleEvents = eventHistory.slice(-this.eventsViewportSize);
    }

    visibleEvents.reverse().forEach((event, displayIndex) => {
      const actualIndex = eventHistory.indexOf(event);
      // 网格中从新到旧，所以最新事件(index=length-1)在 startY，最旧(index=0)在 startY+length-1
      const gridYOffset = eventHistory.length - 1 - actualIndex;
      const lineY = startY + gridYOffset;
      const isSelected = cursorPos.x === 1 && cursorPos.y === lineY;

      const timeStr = event.time.toLocaleTimeString('zh-CN').substring(3);
      let message = '';

      switch (event.type) {
        case 'balance_change':
          const sign = event.delta > 0 ? '+' : '';
          const colorCode = event.delta > 0 ? '\x1b[32m' : '\x1b[31m';
          message = `${event.token}:${colorCode}${sign}${event.delta.toFixed(2)}\x1b[0m`;
          break;

        case 'order_filled':
          message = `\x1b[32m完成\x1b[0m ${event.side} ${event.outcome} @${event.price}`;
          break;

        case 'order_removed':
          message = `\x1b[33m移除\x1b[0m ${event.side} ${event.outcome} ${event.filled}/${event.amount}`;
          break;

        case 'order_partially_filled':
          message = `\x1b[36m部分\x1b[0m ${event.side} +${event.filledAmount}`;
          break;

        case 'order_created':
          message = `\x1b[35m新单\x1b[0m ${event.side} ${event.outcome} @${event.price}`;
          break;

        default:
          message = `未知: ${event.type}`;
      }

      const line = `${timeStr} ${message}`;

      if (isSelected) {
        lines.push(`\x1b[7m${line}\x1b[0m`);
      } else {
        lines.push(line);
      }
    });

    return { lines, width: 58 };
  }

  buildGridItems(context) {
    const { eventHistory, openOrders } = context;
    const items = [];

    if (eventHistory.length === 0) {
      return items;
    }

    // 找到第一个空行
    let startY = 0;
    if (openOrders && openOrders.list) {
      startY = openOrders.list.length;
    }

    // 反向遍历：从最新（末尾）到最旧（开头）
    for (let i = eventHistory.length - 1; i >= 0; i--) {
      const event = eventHistory[i];
      const gridYOffset = eventHistory.length - 1 - i;
      const y = startY + gridYOffset;

      items.push({
        x: 1,
        y: y,
        type: 'event',
        data: { event, index: i },
        renderData: event,
        onSelect: () => {} // 事件历史不可选择执行操作
      });
    }

    return items;
  }

  getDimensions(context) {
    const { eventHistory } = context;
    const height = 2 + Math.min(eventHistory.length, this.eventsViewportSize); // 标题 + 事件行
    return { width: 58, height };
  }
}

module.exports = EventHistoryPanel;
