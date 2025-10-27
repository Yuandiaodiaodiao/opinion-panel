/**
 * 面板基类 - 定义统一的面板接口
 *
 * 所有面板都应该实现这个基类的方法
 */
class PanelBase {
  constructor(dashboard) {
    this.dashboard = dashboard;
  }

  /**
   * 渲染面板内容
   * @param {Object} context - 渲染上下文（包含当前状态、数据等）
   * @returns {Object} { lines: string[], width: number }
   */
  render(context) {
    throw new Error('Panel must implement render() method');
  }

  /**
   * 构建选择网格项
   * @param {Object} context - 渲染上下文
   * @returns {Array} 网格项数组 [{ x, y, type, data, renderData, onSelect }]
   */
  buildGridItems(context) {
    return [];
  }

  /**
   * 获取面板尺寸
   * @param {Object} context - 渲染上下文
   * @returns {Object} { width: number, height: number }
   */
  getDimensions(context) {
    return { width: 0, height: 0 };
  }

  /**
   * 面板是否可见
   * @param {Object} context - 渲染上下文
   * @returns {boolean}
   */
  isVisible(context) {
    return true;
  }

  /**
   * 辅助方法：格式化数字
   */
  formatNumber(num, decimals = 4) {
    if (num === null || num === undefined) return 'N/A';
    return num.toFixed(decimals);
  }

  /**
   * 辅助方法：计算显示宽度（处理中文字符）
   */
  getDisplayWidth(str) {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if ((code >= 0x4E00 && code <= 0x9FFF) ||
          (code >= 0x3000 && code <= 0x303F) ||
          (code >= 0xFF00 && code <= 0xFFEF) ||
          (code >= 0xAC00 && code <= 0xD7AF) ||
          (code >= 0x3400 && code <= 0x4DBF)) {
        width += 2;
      } else {
        width += 1;
      }
    }
    return width;
  }

  /**
   * 辅助方法：移除ANSI转义码
   */
  stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }
}

module.exports = PanelBase;
