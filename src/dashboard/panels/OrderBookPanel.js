const PanelBase = require('../PanelBase');

/**
 * 订单簿面板
 * 显示当前视图（YES/NO）的买单和卖单
 */
class OrderBookPanel extends PanelBase {
  constructor(dashboard) {
    super(dashboard);
  }

  isVisible(context) {
    return true; // 订单簿始终可见
  }

  /**
   * 计算订单簿数据的最大列宽
   */
  calculateColumnWidths(book) {
    if (!book || book.error) {
      return { price: 7, amount: 7, total: 7 };
    }

    let maxAmountWidth = 7;
    let maxTotalWidth = 7;
    const priceWidth = 7;

    if (book.asks && book.asks.length > 0) {
      book.asks.slice(0, 10).forEach(ask => {
        const amountStr = this.formatNumber(ask.amount, 2);
        const totalStr = this.formatNumber(ask.total, 2);
        maxAmountWidth = Math.max(maxAmountWidth, amountStr.length);
        maxTotalWidth = Math.max(maxTotalWidth, totalStr.length);
      });
    }

    if (book.bids && book.bids.length > 0) {
      book.bids.slice(0, 10).forEach(bid => {
        const amountStr = this.formatNumber(bid.amount, 2);
        const totalStr = this.formatNumber(bid.total, 2);
        maxAmountWidth = Math.max(maxAmountWidth, amountStr.length);
        maxTotalWidth = Math.max(maxTotalWidth, totalStr.length);
      });
    }

    return {
      price: priceWidth,
      amount: maxAmountWidth,
      total: maxTotalWidth
    };
  }

  render(context) {
    const { currentView, orderBooks, openOrders, gridManager } = context;
    const book = orderBooks[currentView];
    const lines = [];

    const colWidths = this.calculateColumnWidths(book);
    const totalWidth = 2 + colWidths.price + 2 + colWidths.amount + 2 + colWidths.total;
    const orderBookWidth = Math.max(totalWidth, 36);

    if (!book) {
      lines.push('加载中...');
      return { lines, width: orderBookWidth };
    }

    if (book.error) {
      lines.push(`错误: ${book.error}`);
      return { lines, width: orderBookWidth };
    }

    // 构建我的订单价格集合（用于标记）
    const myOrderPrices = new Set();
    if (openOrders && openOrders.list) {
      openOrders.list.forEach(order => {
        if (order.outcome === currentView && order.price) {
          const price = parseFloat(order.price).toFixed(4);
          myOrderPrices.add(price);
        }
      });
    }

    const amountLabel = '数量'.padStart(colWidths.amount);
    const totalLabel = '总价值'.padStart(colWidths.total);
    lines.push(`${currentView}订单簿 ${amountLabel} ${totalLabel}`);
    lines.push('━'.repeat(orderBookWidth));

    let lineY = 0;
    const cursorPos = gridManager.getCursorPosition();

    // 卖单区域
    if (book.asks && book.asks.length > 0) {
      const asksToShow = book.asks.slice(0, 10).reverse();
      asksToShow.forEach((ask, index) => {
        const priceStr = this.formatNumber(ask.price, 4).padStart(colWidths.price);
        const amountStr = this.formatNumber(ask.amount, 2).padStart(colWidths.amount);
        const totalStr = this.formatNumber(ask.total, 2).padStart(colWidths.total);

        // 检查是否为选中项
        const isSelected = cursorPos.x === 0 && cursorPos.y === lineY;

        // 检查是否是自己的订单
        const priceKey = ask.price.toFixed(4);
        const myOrderMarker = myOrderPrices.has(priceKey) ? '●' : ' ';

        const lineContent = `${myOrderMarker} ${priceStr} ${amountStr} ${totalStr}`;

        if (isSelected) {
          lines.push(`\x1b[7m\x1b[31m${lineContent}\x1b[0m`);
        } else {
          lines.push(`\x1b[31m${lineContent}\x1b[0m`);
        }

        lineY++;
      });
    } else {
      lines.push('暂无卖单');
    }

    // 买单区域
    lines.push('━'.repeat(orderBookWidth));

    if (book.bids && book.bids.length > 0) {
      const bidsToShow = book.bids.slice(0, 10);
      bidsToShow.forEach((bid, index) => {
        const priceStr = this.formatNumber(bid.price, 4).padStart(colWidths.price);
        const amountStr = this.formatNumber(bid.amount, 2).padStart(colWidths.amount);
        const totalStr = this.formatNumber(bid.total, 2).padStart(colWidths.total);

        const isSelected = cursorPos.x === 0 && cursorPos.y === lineY;

        const priceKey = bid.price.toFixed(4);
        const myOrderMarker = myOrderPrices.has(priceKey) ? '●' : ' ';

        const lineContent = `${myOrderMarker} ${priceStr} ${amountStr} ${totalStr}`;

        if (isSelected) {
          lines.push(`\x1b[7m\x1b[32m${lineContent}\x1b[0m`);
        } else {
          lines.push(`\x1b[32m${lineContent}\x1b[0m`);
        }

        lineY++;
      });
    } else {
      lines.push('暂无买单');
    }

    return { lines, width: orderBookWidth };
  }

  buildGridItems(context) {
    const { currentView, orderBooks, selectOrderBookItem } = context;
    const book = orderBooks[currentView];
    const items = [];

    if (!book || book.error) {
      return items;
    }

    let y = 0;

    // 卖单（从高到低，倒序显示）
    if (book.asks && book.asks.length > 0) {
      const asksToShow = book.asks.slice(0, 10).reverse();
      asksToShow.forEach((ask, index) => {
        items.push({
          x: 0,
          y: y,
          type: 'orderbook_ask',
          data: { order: ask, side: 'ask', index },
          renderData: ask,
          onSelect: () => selectOrderBookItem('ask', ask)
        });
        y++;
      });
    }

    // 买单（从高到低）
    if (book.bids && book.bids.length > 0) {
      const bidsToShow = book.bids.slice(0, 10);
      bidsToShow.forEach((bid, index) => {
        items.push({
          x: 0,
          y: y,
          type: 'orderbook_bid',
          data: { order: bid, side: 'bid', index },
          renderData: bid,
          onSelect: () => selectOrderBookItem('bid', bid)
        });
        y++;
      });
    }

    return items;
  }

  getDimensions(context) {
    const { orderBooks, currentView } = context;
    const book = orderBooks[currentView];
    const colWidths = this.calculateColumnWidths(book);
    const width = Math.max(2 + colWidths.price + 2 + colWidths.amount + 2 + colWidths.total, 36);

    let height = 2; // 标题 + 分隔符
    if (book && !book.error) {
      if (book.asks && book.asks.length > 0) {
        height += Math.min(book.asks.length, 10);
      } else {
        height += 1;
      }
      height += 1; // 中间分隔符
      if (book.bids && book.bids.length > 0) {
        height += Math.min(book.bids.length, 10);
      } else {
        height += 1;
      }
    } else {
      height += 1;
    }

    return { width, height };
  }
}

module.exports = OrderBookPanel;
