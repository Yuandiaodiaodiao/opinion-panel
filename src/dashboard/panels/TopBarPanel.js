const PanelBase = require('../PanelBase');

/**
 * 顶部栏面板
 * 显示主题信息、刷新状态、库存等
 */
class TopBarPanel extends PanelBase {
  constructor(dashboard) {
    super(dashboard);
  }

  isVisible(context) {
    return true; // 顶部栏始终可见
  }

  render(context) {
    const { topicInfo, currentView, orderBooks, previousInventory, gridManager, refreshInterval, networkMonitor } = context;
    const lines = [];
    const book = orderBooks[currentView];

    // 当前焦点区域提示
    const selected = gridManager.getCurrentSelection();
    let focusHint = '';
    if (selected) {
      if (selected.type.startsWith('orderbook')) {
        focusHint = '◄订单簿';
      } else if (selected.type === 'my_order') {
        focusHint = '◄我的订单';
      } else if (selected.type === 'event') {
        focusHint = '◄事件历史';
      }
    }

    const refreshStatus = `${refreshInterval / 1000}s`;
    lines.push(`${topicInfo.title.substring(0, 50)} | 刷新:${refreshStatus} ${focusHint}`);

    lines.push(`[TAB]切换YES/NO [↑↓←→]导航 [Enter]选择 [H]盈亏 [A]追踪 [Q]退出`);

    // 库存
    let inventoryLine = '';
    if (previousInventory) {
      const tokenLabels = {
        [topicInfo.yesToken]: 'YES',
        [topicInfo.noToken]: 'NO'
      };

      const inventoryParts = [];
      previousInventory.nfts.forEach(nft => {
        const label = tokenLabels[nft.tokenId] || 'UNKNOWN';
        const balance = parseFloat(nft.formatted).toFixed(2);
        const colorCode = label === 'YES' ? '\x1b[32m' : '\x1b[33m';
        inventoryParts.push(`${label}:${colorCode}${balance}\x1b[0m`);
      });

      const usdtBalance = parseFloat(previousInventory.usdt.formatted).toFixed(2);
      inventoryParts.push(`USDT:\x1b[36m${usdtBalance}\x1b[0m`);

      inventoryLine = `库存: ${inventoryParts.join(' ')}`;
    }

    const timestamp = book && book.timestamp ? new Date(book.timestamp).toLocaleTimeString('zh-CN') : '--:--:--';
    const qps = networkMonitor ? networkMonitor.getQPS() : 0;
    const qpsDisplay = qps > 0 ? `QPS:${qps}` : 'QPS:0.00';
    const updateTime = `更新: ${timestamp}  |  ${qpsDisplay}`;

    lines.push(`${inventoryLine}  |  ${updateTime}`);

    return { lines, width: 120 };
  }

  buildGridItems(context) {
    // 顶部栏不参与网格选择
    return [];
  }

  getDimensions(context) {
    return { width: 120, height: 3 };
  }
}

module.exports = TopBarPanel;
