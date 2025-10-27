const PanelBase = require('../PanelBase');

/**
 * 自动清理询问面板
 * 询问是否启用自动库存清理
 */
class AutoClearAskPanel extends PanelBase {
  constructor(dashboard) {
    super(dashboard);
  }

  isVisible(context) {
    return context.interactionMode === 'askAutoClear';
  }

  render(context) {
    const { submitMessage } = context;
    const lines = [];

    lines.push('');
    lines.push('┌─────────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                              🤖 启用自动库存清理？                                │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────────┤');
    lines.push('│'.padEnd(84) + '│');
    lines.push('│  订单成交后，系统将自动挂反向清理单：'.padEnd(84) + '│');
    lines.push('│  • 根据盘口点差智能定价（保证不亏本）'.padEnd(84) + '│');
    lines.push('│  • 避免市价成交（不产生手续费）'.padEnd(84) + '│');
    lines.push('│  • 自动选择最优清理价格'.padEnd(84) + '│');
    lines.push('│'.padEnd(84) + '│');
    lines.push('│  [Y] 启用自动清理  |  [N] 跳过  |  [ESC] 取消'.padEnd(84) + '│');
    lines.push('└─────────────────────────────────────────────────────────────────────────────────┘');

    if (submitMessage) {
      lines.push('');
      lines.push(`  ${submitMessage}`);
    }

    return { lines, width: 84 };
  }

  buildGridItems(context) {
    // 自动清理询问面板不参与网格选择
    return [];
  }

  getDimensions(context) {
    let height = 11; // 基本行数
    if (context.submitMessage) {
      height += 2; // 消息行
    }
    return { width: 84, height };
  }
}

module.exports = AutoClearAskPanel;
