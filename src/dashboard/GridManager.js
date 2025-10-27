/**
 * 网格管理器 - 管理二维选择网格
 *
 * 负责：
 * - 构建和管理选择网格
 * - 光标位置和移动
 * - 选择项的执行
 */
class GridManager {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.grid = [];
    this.cursorX = 0;
    this.cursorY = 0;
  }

  /**
   * 构建选择网格
   * @param {Array} panels - 面板数组
   * @param {Object} context - 渲染上下文
   */
  buildGrid(panels, context) {
    this.grid = [];

    // 从所有面板收集网格项
    panels.forEach(panel => {
      if (panel.isVisible(context)) {
        const items = panel.buildGridItems(context);
        items.forEach(item => {
          if (!this.grid[item.y]) {
            this.grid[item.y] = [];
          }
          this.grid[item.y][item.x] = {
            type: item.type,
            data: item.data,
            renderData: item.renderData,
            onSelect: item.onSelect
          };
        });
      }
    });

    return this.grid;
  }

  /**
   * 获取当前选中的项
   */
  getCurrentSelection() {
    if (!this.grid[this.cursorY]) return null;
    return this.grid[this.cursorY][this.cursorX];
  }

  /**
   * 移动光标
   * @param {number} dx - X方向偏移
   * @param {number} dy - Y方向偏移
   */
  moveCursor(dx, dy) {
    const newX = this.cursorX + dx;
    const newY = this.cursorY + dy;

    // 检查新位置是否有效
    if (newY >= 0 && newY < this.grid.length) {
      if (this.grid[newY] && this.grid[newY][newX]) {
        this.cursorX = newX;
        this.cursorY = newY;
        return true;
      }
    }

    // 垂直移动：在同列查找下一个有效项
    if (dy !== 0 && dx === 0) {
      for (let y = Math.max(0, newY); y < this.grid.length && y >= 0; dy > 0 ? y++ : y--) {
        if (this.grid[y] && this.grid[y][this.cursorX]) {
          this.cursorY = y;
          return true;
        }
        if (dy < 0 && y === 0) break;
      }
    }

    // 水平移动：钳位到目标列的有效范围
    if (dx !== 0 && dy === 0) {
      if (newX >= 0) {
        // 在目标列查找最接近当前Y坐标的有效项
        let bestY = -1;
        let bestDistance = Infinity;

        for (let y = 0; y < this.grid.length; y++) {
          if (this.grid[y] && this.grid[y][newX]) {
            const distance = Math.abs(y - this.cursorY);
            // 优先选择Y坐标小于等于当前Y的项（向上钳位）
            // 如果都大于当前Y，则选择最小的
            if (y <= this.cursorY) {
              if (distance < bestDistance || (distance === bestDistance && y > bestY)) {
                bestDistance = distance;
                bestY = y;
              }
            } else if (bestY === -1 || y < bestY) {
              // 还没找到小于等于的，先记录第一个大于的
              bestY = y;
              bestDistance = distance;
            }
          }
        }

        if (bestY !== -1) {
          this.cursorX = newX;
          this.cursorY = bestY;
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 执行当前选中项
   */
  executeSelection() {
    const selected = this.getCurrentSelection();
    if (selected && selected.onSelect) {
      selected.onSelect();
    }
  }

  /**
   * 重置光标位置
   */
  resetCursor() {
    this.cursorX = 0;
    this.cursorY = 0;
  }

  /**
   * 获取光标位置
   */
  getCursorPosition() {
    return { x: this.cursorX, y: this.cursorY };
  }

  /**
   * 设置光标位置
   */
  setCursorPosition(x, y) {
    this.cursorX = x;
    this.cursorY = y;
  }
}

module.exports = GridManager;
