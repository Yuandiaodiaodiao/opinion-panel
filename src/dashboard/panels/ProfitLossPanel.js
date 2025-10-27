const PanelBase = require('../PanelBase');

/**
 * 历史盈亏面板
 * 显示交易盈亏统计
 */
class ProfitLossPanel extends PanelBase {
  constructor(dashboard) {
    super(dashboard);
  }

  isVisible(context) {
    return context.profitLoss !== null && !context.isInteractionMode;
  }

  render(context) {
    const { profitLoss } = context;
    const lines = [];

    lines.push('');
    lines.push('┌─────────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                              💰 历史盈亏统计                                      │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────────┤');

    if (profitLoss.loading) {
      lines.push(this.padLine('  📊 正在加载历史成交数据，请稍候...'));
    } else if (profitLoss.error) {
      lines.push(this.padLine(`  ❌ 加载失败: ${profitLoss.error}`));
    } else {
      const pl = profitLoss;
      const profitLossColor = pl.profitLoss >= 0 ? '\x1b[32m' : '\x1b[31m';
      const profitLossSign = pl.profitLoss >= 0 ? '+' : '';

      // 交易统计
      lines.push(this.padLine(`  总交易笔数: ${pl.tradeCount}  (成功: ${pl.successCount}  失败: ${pl.failedCount})`));
      lines.push(this.padLine(''));

      // 资金流动
      lines.push(this.padLine(`  总流入(花费): ${this.formatAmount(pl.totalInflow)} USDT`));
      lines.push(this.padLine(`  总流出(收入): ${this.formatAmount(pl.totalOutflow)} USDT`));
      lines.push(this.padLine(`  总手续费:     ${this.formatAmount(pl.totalFees)} USDT`));
      lines.push(this.padLine(''));

      // 净盈亏（带颜色）
      lines.push(this.padLineWithColor(`  净盈亏:       ${profitLossColor}${profitLossSign}${this.formatAmount(pl.profitLoss)} USDT\x1b[0m`));
      lines.push('├─────────────────────────────────────────────────────────────────────────────────┤');

      // 当前资产价值部分
      const assetValue = this.calculateAssetValue(context);
      if (assetValue.error) {
        lines.push(this.padLine(`  当前资产: ${assetValue.error}`));
      } else {
        lines.push(this.padLine(`  YES 持仓: ${this.formatShares(assetValue.yesBalance)} 股 @ ${this.formatPrice(assetValue.yesPrice)} = ${this.formatAmount(assetValue.yesValue)} USDT`));
        lines.push(this.padLine(`  NO  持仓: ${this.formatShares(assetValue.noBalance)} 股 @ ${this.formatPrice(assetValue.noPrice)} = ${this.formatAmount(assetValue.noValue)} USDT`));
        lines.push(this.padLineWithColor(`  总资产:   \x1b[36m${this.formatAmount(assetValue.totalValue)} USDT\x1b[0m`));
      }
      lines.push('├─────────────────────────────────────────────────────────────────────────────────┤');

      // 交易类型明细
      const details = [];
      if (pl.details.split.count > 0) {
        details.push(this.padLine(`  拆分: ${this.formatCount(pl.details.split.count)}笔  ${this.formatAmount(pl.details.split.amount)} USDT`));
      }
      if (pl.details.buy.count > 0) {
        details.push(this.padLine(`  买入: ${this.formatCount(pl.details.buy.count)}笔  ${this.formatAmount(pl.details.buy.amount)} USDT`));
      }
      if (pl.details.merge.count > 0) {
        details.push(this.padLine(`  合并: ${this.formatCount(pl.details.merge.count)}笔  ${this.formatAmount(pl.details.merge.amount)} USDT`));
      }
      if (pl.details.sell.count > 0) {
        details.push(this.padLine(`  卖出: ${this.formatCount(pl.details.sell.count)}笔  ${this.formatAmount(pl.details.sell.amount)} USDT`));
      }
      lines.push(...details);
    }

    lines.push('└─────────────────────────────────────────────────────────────────────────────────┘');

    return { lines, width: 84 };
  }

  /**
   * 格式化数量（右对齐）
   */
  formatAmount(value) {
    return value.toFixed(4).padStart(12);
  }

  /**
   * 格式化价格
   */
  formatPrice(value) {
    return value.toFixed(3);
  }

  /**
   * 格式化股数
   */
  formatShares(value) {
    return value.toFixed(2).padStart(8);
  }

  /**
   * 格式化笔数（右对齐）
   */
  formatCount(value) {
    return value.toString().padStart(3);
  }

  /**
   * 计算字符串显示宽度（中文算2个字符）
   */
  getDisplayWidth(str) {
    let width = 0;
    const cleanStr = str.replace(/\x1b\[[0-9;]*m/g, ''); // 移除ANSI颜色码
    for (let i = 0; i < cleanStr.length; i++) {
      const code = cleanStr.charCodeAt(i);
      if (code > 127) {
        width += 2; // 中文字符
      } else {
        width += 1; // 英文字符
      }
    }
    return width;
  }

  /**
   * 填充行到指定宽度
   */
  padLine(content) {
    const displayWidth = this.getDisplayWidth(content);
    const padding = 82 - displayWidth; // 82 = 84 - 2 (边框)
    return '│' + content + ' '.repeat(Math.max(0, padding)) + '│';
  }

  /**
   * 填充带颜色的行
   */
  padLineWithColor(content) {
    const cleanContent = content.replace(/\x1b\[[0-9;]*m/g, '');
    const displayWidth = this.getDisplayWidth(cleanContent);
    const padding = 82 - displayWidth;
    return '│' + content + ' '.repeat(Math.max(0, padding)) + '│';
  }

  /**
   * 计算当前资产价值
   */
  calculateAssetValue(context) {
    const { orderBooks, previousInventory, topicInfo } = context;

    // 检查库存数据是否可用
    if (!previousInventory || !previousInventory.nfts || previousInventory.nfts.length < 2) {
      return { error: '库存数据不可用' };
    }

    // 检查订单簿数据是否可用
    if (!orderBooks || !orderBooks.YES || !orderBooks.NO) {
      return { error: '订单簿数据不可用' };
    }

    // 获取库存（nfts[0]是YES，nfts[1]是NO）
    const yesBalance = parseFloat(previousInventory.nfts[0].formatted) || 0;
    const noBalance = parseFloat(previousInventory.nfts[1].formatted) || 0;

    // 获取盘口价格（使用最高买价作为当前市场价值，即可立即卖出的价格）
    const yesBids = orderBooks.YES.bids || [];
    const noBids = orderBooks.NO.bids || [];

    // 如果没有买单，价格为0
    const yesPrice = yesBids.length > 0 ? parseFloat(yesBids[0].price) : 0;
    const noPrice = noBids.length > 0 ? parseFloat(noBids[0].price) : 0;

    // 计算资产价值
    const yesValue = yesBalance * yesPrice;
    const noValue = noBalance * noPrice;
    const totalValue = yesValue + noValue;

    return {
      yesBalance,
      noBalance,
      yesPrice,
      noPrice,
      yesValue,
      noValue,
      totalValue
    };
  }

  buildGridItems(context) {
    // 盈亏面板不参与网格选择
    return [];
  }

  getDimensions(context) {
    const { profitLoss } = context;
    let height = 4; // 边框和标题

    if (profitLoss.loading || profitLoss.error) {
      height += 1;
    } else {
      height += 10; // 基本信息行（交易笔数、流入流出、手续费、净盈亏等）

      // 当前资产价值部分（标题 + 3行数据/1行错误 + 空行）
      height += 5;

      // 计算交易类型明细行数
      const pl = profitLoss;
      if (pl.details) {
        if (pl.details.split.count > 0) height++;
        if (pl.details.buy.count > 0) height++;
        if (pl.details.merge.count > 0) height++;
        if (pl.details.sell.count > 0) height++;
      }
    }

    height++; // 底部边框

    return { width: 84, height };
  }
}

module.exports = ProfitLossPanel;
