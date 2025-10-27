require('dotenv').config();
const readline = require('readline');
const { exec } = require('child_process');
const OrderBookAPI = require('./src/sdk/OrderBookAPI');
const TopicAPI = require('./src/sdk/TopicAPI');
const InventoryManager = require('./InventoryManager');
const OpinionTradeSDK = require('./src/sdk/OpinionTradeSDK');
const AutoClearManager = require('./AutoClearManager');
const TelegramNotifier = require('./TelegramNotifier');
const config = require('./config');
const { networkMonitor } = require('./src/network/httpClient');

// 导入面板和网格管理器
const GridManager = require('./src/dashboard/GridManager');
const {
  TopBarPanel,
  OrderBookPanel,
  MyOrdersPanel,
  EventHistoryPanel,
  ProfitLossPanel,
  TrackedOrdersPanel,
  InputPanel,
  ConfirmPanel,
  AutoClearAskPanel
} = require('./src/dashboard/panels');

/**
 * 预测市场交易看板 V2
 * 统一二维选择模型，支持自由导航和虚拟滚动
 */
class TradingDashboard {
  constructor(topicId) {
    this.topicId = topicId;
    this.topicAPI = new TopicAPI();
    this.orderBookAPI = null;
    this.inventoryManager = new InventoryManager();
    this.topicInfo = null;

    // 终端宽度（动态获取）
    this.terminalWidth = process.stdout.columns || 120;

    // 账户地址从config读取
    this.accountAddress = config.account;

    // 初始化 SDK（用于查询订单）
    this.sdk = null;
    this.sdkEnabled = false;
    if (process.env.PRIVATE_KEY && process.env.MAKER_ADDRESS) {
      try {
        this.sdk = new OpinionTradeSDK({
          privateKey: process.env.PRIVATE_KEY,
          makerAddress: process.env.MAKER_ADDRESS,
          authorizationToken: process.env.AUTHORIZATION_TOKEN
        });
        this.sdkEnabled = true;
      } catch (error) {
        console.warn('⚠️  SDK初始化失败，订单查询功能将不可用:', error.message);
      }
    }

    // 初始化自动库存清理管理器
    this.autoClearManager = null;
    if (this.sdkEnabled) {
      this.autoClearManager = new AutoClearManager(this.sdk, topicId);
    }

    // 初始化 Telegram 通知器
    this.telegramNotifier = new TelegramNotifier(
      process.env.TELEGRAM_BOT_TOKEN,
      process.env.TELEGRAM_CHAT_ID
    );

    // 订单簿数据
    this.currentView = 'YES';
    this.orderBooks = {
      YES: null,
      NO: null
    };

    // Open Orders 数据
    this.openOrders = null;
    this.previousOrderCount = 0;

    // 历史盈亏数据
    this.profitLoss = null;
    this.isLoadingProfitLoss = false;
    this.showProfitLoss = false;

    // 余额监控数据
    this.previousInventory = null;

    // 事件日志数据
    this.eventHistory = [];
    this.MAX_EVENT_HISTORY = 100;

    // 订单追踪
    this.previousOrdersMap = new Map();
    // 用户手动取消的订单ID集合
    this.manuallyCancelledOrders = new Set();

    // 刷新配置（不再暂停）
    this.refreshInterval = 5000;
    this.timer = null;
    this.isRunning = false;

    // 自动清理状态
    this.showTrackedOrders = false;

    // 订单簿动态宽度
    this.currentOrderBookWidth = 55;

    // ========== 新的统一选择模型 ==========
    // 网格管理器
    this.gridManager = new GridManager(this);

    // 初始化所有面板
    this.panels = {
      topBar: new TopBarPanel(this),
      orderBook: new OrderBookPanel(this),
      myOrders: new MyOrdersPanel(this),
      eventHistory: new EventHistoryPanel(this),
      profitLoss: new ProfitLossPanel(this),
      trackedOrders: new TrackedOrdersPanel(this),
      input: new InputPanel(this),
      confirm: new ConfirmPanel(this),
      autoClearAsk: new AutoClearAskPanel(this)
    };

    // 交互模式状态
    this.interactionMode = null; // null | 'inputShares' | 'confirm' | 'submitting' | 'askAutoClear' | 'confirmCancel'
    this.inputBuffer = '';
    this.priceAdjustment = 0;
    this.submitMessage = '';
    this.lastSubmittedOrderId = null;
    this.autoClearEnabled = false; // 是否启用自动清理


    // 提示消息定时器
    this.messageTimer = null;

    // 设置readline接口
    this.setupReadline();
  }

  /**
   * 初始化
   */
  async initialize() {
    console.log(`正在获取 Topic ${this.topicId} 信息...`);
    this.topicInfo = await this.topicAPI.getTopicInfo(this.topicId);
    console.log(`标题: ${this.topicInfo.title}`);
    console.log(`YES Token: ${this.topicInfo.yesToken.substring(0, 20)}...`);
    console.log(`NO Token: ${this.topicInfo.noToken.substring(0, 20)}...`);
    console.log(`监控账户: ${this.accountAddress}`);
    console.log();

    const orderBookConfig = await this.topicAPI.getOrderBookConfig(this.topicId);
    this.orderBookAPI = new OrderBookAPI(orderBookConfig);
    this.tokenIds = [this.topicInfo.yesToken, this.topicInfo.noToken];

    if (this.autoClearManager) {
      await this.autoClearManager.initialize();
    }
  }

  /**
   * 构建二维选择网格（使用面板）
   */
  buildSelectionGrid() {
    const context = this.getRenderContext();
    const panels = [
      this.panels.orderBook,
      this.panels.myOrders,
      this.panels.eventHistory
    ];
    return this.gridManager.buildGrid(panels, context);
  }

  /**
   * 获取渲染上下文（所有面板共享的数据）
   */
  getRenderContext() {
    return {
      topicId: this.topicId,
      topicInfo: this.topicInfo,
      currentView: this.currentView,
      orderBooks: this.orderBooks,
      openOrders: this.openOrders,
      eventHistory: this.eventHistory,
      previousInventory: this.previousInventory,
      profitLoss: this.profitLoss,
      autoClearManager: this.autoClearManager,
      showTrackedOrders: this.showTrackedOrders,
      sdkEnabled: this.sdkEnabled,
      gridManager: this.gridManager,
      refreshInterval: this.refreshInterval,
      interactionMode: this.interactionMode,
      isInteractionMode: this.interactionMode !== null,
      selectedOrderData: this.selectedOrderData,
      inputBuffer: this.inputBuffer,
      priceAdjustment: this.priceAdjustment,
      submitMessage: this.submitMessage,
      autoClearEnabled: this.autoClearEnabled,
      selectOrderBookItem: this.selectOrderBookItem.bind(this),
      selectMyOrder: this.selectMyOrder.bind(this),
      networkMonitor: networkMonitor
    };
  }

  /**
   * 选择订单簿项目
   */
  selectOrderBookItem(side, order) {
    if (!this.sdkEnabled) {
      this.showMessage('⚠️  请先配置.env文件（PRIVATE_KEY, MAKER_ADDRESS, AUTHORIZATION_TOKEN）', 3000);
      return;
    }

    // 进入输入模式
    this.interactionMode = 'inputShares';
    this.inputBuffer = '';
    this.priceAdjustment = 0;
    this.selectedOrderData = { side, order };
    // 反向订单默认关闭
    this.autoClearEnabled = false;
    this.render();
  }

  /**
   * 选择我的订单
   */
  selectMyOrder(order) {
    if (!this.sdkEnabled) {
      this.showMessage('⚠️  请先配置.env文件以使用撤单功能', 3000);
      return;
    }

    const sideLabel = order.side === 1 ? 'BUY' : 'SELL';
    const outcome = order.outcome || 'N/A';
    const price = order.price ? parseFloat(order.price).toFixed(3) : 'N/A';
    const amount = order.amount ? parseFloat(order.amount).toFixed(2) : 'N/A';

    this.submitMessage = `🤔 确认撤销订单? ${sideLabel} ${outcome} @${price} x${amount} [Y/N]`;
    this.interactionMode = 'confirmCancel';
    this.selectedOrderData = { order };
    this.render();
  }

  /**
   * 显示临时消息
   */
  showMessage(message, duration = 3000) {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
    }
    this.submitMessage = message;
    this.render();
    this.messageTimer = setTimeout(() => {
      this.submitMessage = '';
      this.render();
    }, duration);
  }

  /**
   * 设置readline接口监听键盘输入
   */
  setupReadline() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdout.on('resize', () => {
      this.terminalWidth = process.stdout.columns || 120;
      this.render();
    });

    process.stdin.on('keypress', (str, key) => {
      if (!key) return;

      // Ctrl+C 退出
      if (key.ctrl && key.name === 'c') {
        this.stop();
        process.exit(0);
      }

      // ESC键 - 取消操作
      if (key.name === 'escape') {
        this.handleEscape();
        return;
      }

      // 特殊交互模式
      if (this.interactionMode === 'inputShares') {
        this.handleInputMode(str, key);
        return;
      }

      if (this.interactionMode === 'confirm' || this.interactionMode === 'submitting') {
        this.handleConfirmMode(key);
        return;
      }

      if (this.interactionMode === 'confirmCancel') {
        this.handleCancelConfirmMode(str, key);
        return;
      }

      if (this.interactionMode === 'askAutoClear') {
        this.handleAutoClearMode(str, key);
        return;
      }

      // 正常导航模式
      this.handleNavigationKeys(str, key);
    });
  }

  /**
   * 处理导航按键
   */
  handleNavigationKeys(str, key) {
    // 上下左右导航
    if (key.name === 'up') {
      this.moveCursor(0, -1);
      return;
    }
    if (key.name === 'down') {
      this.moveCursor(0, 1);
      return;
    }
    if (key.name === 'left') {
      this.moveCursor(-1, 0);
      return;
    }
    if (key.name === 'right') {
      this.moveCursor(1, 0);
      return;
    }

    // 回车键 - 执行选中项
    if (key.name === 'return') {
      this.gridManager.executeSelection();
      return;
    }

    // Tab键 - 切换YES/NO视图
    if (key.name === 'tab') {
      this.toggleView();
      return;
    }

    // Q键 - 退出
    if (key.name === 'q') {
      this.stop();
      process.exit(0);
    }

    // R键 - 手动刷新
    if (key.name === 'r') {
      this.refresh();
    }

    // H键 - 切换显示历史盈亏
    if (str === 'h' || str === 'H') {
      this.toggleProfitLoss();
    }

    // A键 - 切换显示追踪订单
    if (str === 'a' || str === 'A') {
      this.toggleTrackedOrders();
    }
  }

  /**
   * 移动光标
   */
  moveCursor(dx, dy) {
    // 重建网格（确保数据最新）
    this.buildSelectionGrid();

    // 使用 GridManager 移动光标
    if (this.gridManager.moveCursor(dx, dy)) {
      this.render();
    }
  }

  /**
   * 处理ESC键
   */
  handleEscape() {
    if (this.interactionMode === 'submitting') return;

    if (this.interactionMode === 'confirm') {
      this.interactionMode = 'inputShares';
      this.render();
    } else if (this.interactionMode === 'inputShares') {
      this.interactionMode = null;
      this.selectedOrderData = null;
      this.render();
    } else if (this.interactionMode === 'confirmCancel' || this.interactionMode === 'askAutoClear') {
      this.interactionMode = null;
      this.selectedOrderData = null;
      this.submitMessage = '';
      this.render();
    }
  }

  /**
   * 处理输入模式
   */
  handleInputMode(str, key) {
    if (key.name === 'return') {
      const shares = parseFloat(this.inputBuffer);
      if (isNaN(shares) || shares <= 0) {
        this.showMessage('❌ 请输入有效的数量（大于0的数字）', 2000);
        return;
      }
      this.interactionMode = 'confirm';
      this.render();
      return;
    }

    if (key.name === 'escape') {
      this.handleEscape();
      return;
    }

    if (key.name === 'backspace') {
      this.inputBuffer = this.inputBuffer.slice(0, -1);
      this.render();
      return;
    }

    // Tab键 - 切换自动清理选项（仅对买单有效）
    if (key.name === 'tab') {
      if (this.selectedOrderData.side === 'bid' && this.autoClearManager) {
        this.autoClearEnabled = !this.autoClearEnabled;
        this.render();
      }
      return;
    }

    // 上下键调整价格
    if (key.name === 'up' || key.name === 'down') {
      const adjustment = key.name === 'up' ? 1 : -1;
      const newAdjustment = this.priceAdjustment + adjustment;
      const basePrice = this.selectedOrderData.order.price;
      const newPrice = basePrice + (newAdjustment * 0.001);

      if (newPrice >= 0.001 && newPrice <= 0.999) {
        this.priceAdjustment = newAdjustment;
        this.render();
      }
      return;
    }

    // M键 - 填充最大可下单数量
    if (str === 'm' || str === 'M') {
      const maxAmount = this.calculateMaxAmount();
      if (maxAmount > 0) {
        this.inputBuffer = maxAmount.toFixed(2);
        this.render();
      }
      return;
    }

    // 只接受数字和小数点
    if (str && /^[0-9.]$/.test(str)) {
      if (str === '.' && this.inputBuffer.includes('.')) return;
      this.inputBuffer += str;
      this.render();
    }
  }

  /**
   * 处理确认模式
   */
  handleConfirmMode(key) {
    if (this.interactionMode === 'submitting') return;

    if (key.name === 'return') {
      this.submitOrder();
    } else if (key.name === 'escape') {
      this.handleEscape();
    }
  }

  /**
   * 处理撤销订单确认模式
   */
  handleCancelConfirmMode(str, key) {
    if (key.name === 'escape') {
      this.interactionMode = null;
      this.selectedOrderData = null;
      this.submitMessage = '';
      this.render();
      return;
    }

    const input = str ? str.toLowerCase() : '';

    if (input === 'y') {
      this.executeCancelOrder();
    } else if (input === 'n') {
      this.interactionMode = null;
      this.selectedOrderData = null;
      this.submitMessage = '';
      this.render();
    }
  }

  /**
   * 执行撤销订单
   */
  async executeCancelOrder() {
    const order = this.selectedOrderData.order;

    this.submitMessage = '📤 正在撤销订单...';
    this.render();

    try {
      const sideLabel = order.side === 1 ? 'BUY' : 'SELL';
      const outcome = order.outcome || 'N/A';
      const price = order.price ? parseFloat(order.price).toFixed(3) : 'N/A';

      await this.sdk.cancelOrder({
        transNo: order.transNo
      });

      // 记录手动取消的订单ID，避免发送 Telegram 通知
      if (order.orderId) {
        this.manuallyCancelledOrders.add(order.orderId);
      }

      this.showMessage(`✅ 订单已撤销: ${sideLabel} ${outcome} @${price}`, 2000);
      this.playBeep();

      await this.refresh();

      setTimeout(() => {
        this.interactionMode = null;
        this.selectedOrderData = null;
        this.render();
      }, 2000);

    } catch (error) {
      this.showMessage(`❌ 撤销失败: ${error.message}`, 3000);
      this.interactionMode = null;
      this.selectedOrderData = null;
    }
  }

  /**
   * 处理自动清理询问模式
   */
  handleAutoClearMode(str, key) {
    if (key.name === 'escape') {
      this.interactionMode = null;
      this.selectedOrderData = null;
      this.submitMessage = '';
      this.render();
      return;
    }

    const input = str ? str.toLowerCase() : '';

    if (input === 'y') {
      this.enableAutoClearForLastOrder();
    } else if (input === 'n') {
      this.showMessage('⏭️  已跳过自动清理', 2000);
      this.interactionMode = null;
      this.selectedOrderData = null;
    }
  }

  /**
   * 为最后提交的订单启用自动清理
   */
  async enableAutoClearForLastOrder() {
    if (!this.lastSubmittedOrderId || !this.autoClearManager) {
      this.showMessage('❌ 无法启用自动清理：订单ID缺失', 2000);
      this.interactionMode = null;
      this.selectedOrderData = null;
      return;
    }

    try {
      const adjustedPrice = this.selectedOrderData.order.price + (this.priceAdjustment * 0.001);
      const shares = parseFloat(this.inputBuffer);

      await this.autoClearManager.trackOrder({
        orderId: this.lastSubmittedOrderId,
        topicId: this.topicId,
        position: this.currentView,
        side: this.selectedOrderData.side === 'bid' ? 1 : 2,
        price: (adjustedPrice * 100).toFixed(2),
        amount: shares.toFixed(4)
      });

      this.showMessage('✅ 自动清理已启用！订单成交后将自动挂反向单', 3000);
      this.interactionMode = null;
      this.selectedOrderData = null;

    } catch (error) {
      this.showMessage(`❌ 启用自动清理失败: ${error.message}`, 3000);
      this.interactionMode = null;
      this.selectedOrderData = null;
    }
  }

  /**
   * 切换追踪订单显示
   */
  toggleTrackedOrders() {
    this.showTrackedOrders = !this.showTrackedOrders;
    this.render();
  }

  /**
   * 切换历史盈亏显示
   */
  toggleProfitLoss() {
    this.showProfitLoss = !this.showProfitLoss;
    if (this.showProfitLoss && !this.profitLoss) {
      // 如果要显示但数据为空，则加载数据
      this.fetchProfitLoss();
    } else if (!this.showProfitLoss) {
      // 如果要隐藏，则清空数据
      this.profitLoss = null;
      this.render();
    }
  }

  /**
   * 计算最大可下单数量（委托给 InputPanel）
   */
  calculateMaxAmount() {
    const context = this.getRenderContext();
    return this.panels.input.calculateMaxAmount(context);
  }

  /**
   * 获取历史盈亏
   */
  async fetchProfitLoss() {
    if (!this.sdkEnabled) {
      this.showMessage('⚠️  请先配置.env文件以使用历史盈亏功能', 3000);
      return;
    }

    if (this.isLoadingProfitLoss) {
      return;
    }

    this.isLoadingProfitLoss = true;
    this.profitLoss = { loading: true };
    this.render();

    try {
      const result = await this.sdk.getProfitLoss({
        topicId: this.topicId
      });

      this.profitLoss = result;
      this.isLoadingProfitLoss = false;
      this.render();

    } catch (error) {
      console.error('获取历史盈亏失败:', error.message);
      this.profitLoss = { error: error.message };
      this.isLoadingProfitLoss = false;
      this.render();

      // 3秒后清空错误信息并关闭面板
      setTimeout(() => {
        this.profitLoss = null;
        this.showProfitLoss = false;
        this.render();
      }, 3000);
    }
  }

  /**
   * 提交订单
   */
  async submitOrder() {
    this.interactionMode = 'submitting';
    this.submitMessage = '📤 提交订单中...';
    this.render();

    try {
      const adjustedPrice = this.selectedOrderData.order.price + (this.priceAdjustment * 0.001);
      const orderParams = {
        topicId: this.topicId,
        position: this.currentView,
        limitPrice: (adjustedPrice * 100).toFixed(2),
        shares: this.inputBuffer
      };

      let result;
      if (this.selectedOrderData.side === 'bid') {
        result = await this.sdk.buyByTopic(orderParams);
      } else {
        result = await this.sdk.sellByTopic(orderParams);
      }

      const orderId = result.result?.orderData?.orderId || result.orderId;
      this.lastSubmittedOrderId = orderId;

      const pricePercent = (adjustedPrice * 100).toFixed(2);
      const shares = parseFloat(this.inputBuffer);
      const actionLabel = this.selectedOrderData.side === 'bid' ? 'BUY' : 'SELL';

      // 如果是买单且启用了自动清理，立即启用追踪
      if (this.selectedOrderData.side === 'bid' && this.autoClearManager && orderId && this.autoClearEnabled) {
        await this.autoClearManager.trackOrder({
          orderId: orderId,
          topicId: this.topicId,
          position: this.currentView,
          side: 1, // BUY
          price: (adjustedPrice * 100).toFixed(2),
          amount: shares.toFixed(4)
        });
        this.submitMessage = `✅ 订单提交成功！${actionLabel} ${this.currentView} @${pricePercent}% x${shares.toFixed(2)} (自动清理已启用)`;
      } else {
        this.submitMessage = `✅ 订单提交成功！${actionLabel} ${this.currentView} @${pricePercent}% x${shares.toFixed(2)}`;
      }

      this.playBeep();

      await this.refresh();

      setTimeout(() => {
        this.interactionMode = null;
        this.selectedOrderData = null;
        this.submitMessage = '';
        this.autoClearEnabled = false;
        this.render();
      }, 3000);

    } catch (error) {
      this.submitMessage = `❌ 订单提交失败: ${error.message}`;
      this.interactionMode = 'confirm';
      this.render();

      setTimeout(() => {
        this.submitMessage = '';
        this.render();
      }, 3000);
    }
  }

  /**
   * 切换YES/NO视图
   */
  toggleView() {
    this.currentView = this.currentView === 'YES' ? 'NO' : 'YES';
    // 重置光标到左上角
    this.gridManager.resetCursor();
    this.render();
  }

  /**
   * 清屏
   */
  clearScreen() {
    console.clear();
  }

  /**
   * 格式化数字
   */
  formatNumber(num, decimals = 4) {
    if (num === null || num === undefined) return 'N/A';
    return num.toFixed(decimals);
  }

  /**
   * 播放提示音
   */
  playBeep() {
    const beepCommand = 'powershell.exe -c "[console]::beep(3000,100); [console]::beep(5000,200); [console]::beep(3000,100)"';
    exec(beepCommand, (error) => {
      if (error) {
        console.error('提示音播放失败:', error.message);
      }
    });
  }

  /**
   * 添加事件到历史记录
   */
  addEvent(eventType, data) {
    const event = {
      time: new Date(),
      type: eventType,
      ...data
    };

    this.eventHistory.push(event);

    while (this.eventHistory.length > this.MAX_EVENT_HISTORY) {
      this.eventHistory.shift();
    }
  }

  /**
   * 检测库存变化
   */
  detectBalanceChanges(current, previous) {
    if (!previous) return;

    const tokenLabels = {
      [this.topicInfo.yesToken]: 'YES',
      [this.topicInfo.noToken]: 'NO'
    };

    for (let i = 0; i < current.nfts.length; i++) {
      const nftDelta = parseFloat(current.nfts[i].formatted) - parseFloat(previous.nfts[i].formatted);
      if (nftDelta !== 0) {
        const label = tokenLabels[current.nfts[i].tokenId] || `Token ${i + 1}`;
        this.addEvent('balance_change', {
          token: label,
          delta: nftDelta,
          from: previous.nfts[i].formatted,
          to: current.nfts[i].formatted
        });
      }
    }
  }

  /**
   * 检测订单变化
   */
  detectOrderChanges(currentOrders) {
    if (!currentOrders || !currentOrders.list) return;

    const currentOrdersMap = new Map();
    currentOrders.list.forEach(order => {
      currentOrdersMap.set(order.orderId, order);
    });

    this.previousOrdersMap.forEach((prevOrder, orderId) => {
      const currentOrder = currentOrdersMap.get(orderId);

      if (!currentOrder) {
        const sideLabel = prevOrder.side === 1 ? 'BUY' : 'SELL';
        const outcome = prevOrder.outcome || 'N/A';
        const price = parseFloat(prevOrder.price).toFixed(4);
        const amount = parseFloat(prevOrder.amount).toFixed(4);
        const filled = parseFloat(prevOrder.filled || 0).toFixed(4);

        const isFilled = parseFloat(filled) >= parseFloat(amount) * 0.99;

        const eventData = {
          orderId: orderId,
          side: sideLabel,
          outcome: outcome,
          price: price,
          amount: amount,
          filled: filled,
          title: this.topicInfo?.title
        };

        this.addEvent(isFilled ? 'order_filled' : 'order_removed', eventData);

        // 检查是否是用户手动取消的订单
        const isManuallyCancelled = this.manuallyCancelledOrders.has(orderId);

        if (isFilled) {
          // 订单完全成交，总是发送通知
          this.telegramNotifier.notifyOrderFilled(eventData).catch(err => {
            console.error('发送 Telegram 通知失败:', err.message);
          });
        } else if (!isManuallyCancelled) {
          // 订单被移除但不是用户手动取消的，发送通知
          this.telegramNotifier.notifyOrderRemoved(eventData).catch(err => {
            console.error('发送 Telegram 通知失败:', err.message);
          });
        }

        // 清理手动取消标记
        if (isManuallyCancelled) {
          this.manuallyCancelledOrders.delete(orderId);
        }
      } else {
        const prevFilled = parseFloat(prevOrder.filled || 0);
        const currentFilled = parseFloat(currentOrder.filled || 0);

        if (currentFilled > prevFilled) {
          const filledDelta = currentFilled - prevFilled;
          const sideLabel = currentOrder.side === 1 ? 'BUY' : 'SELL';
          const outcome = currentOrder.outcome || 'N/A';
          const price = parseFloat(currentOrder.price).toFixed(4);

          this.addEvent('order_partially_filled', {
            orderId: orderId,
            side: sideLabel,
            outcome: outcome,
            price: price,
            filledAmount: filledDelta.toFixed(4),
            totalFilled: currentFilled.toFixed(4),
            totalAmount: parseFloat(currentOrder.amount).toFixed(4),
            title: this.topicInfo?.title
          });
        }
      }
    });

    currentOrdersMap.forEach((currentOrder, orderId) => {
      if (!this.previousOrdersMap.has(orderId)) {
        const sideLabel = currentOrder.side === 1 ? 'BUY' : 'SELL';
        const outcome = currentOrder.outcome || 'N/A';
        const price = parseFloat(currentOrder.price).toFixed(4);
        const amount = parseFloat(currentOrder.amount).toFixed(4);

        this.addEvent('order_created', {
          orderId: orderId,
          side: sideLabel,
          outcome: outcome,
          price: price,
          amount: amount
        });
      }
    });

    this.previousOrdersMap = currentOrdersMap;
  }


  /**
   * 渲染完整界面（使用面板）
   */
  render() {
    this.clearScreen();

    // 重建选择网格
    this.buildSelectionGrid();

    // 获取渲染上下文
    const context = this.getRenderContext();

    // 渲染顶部栏
    const topBarResult = this.panels.topBar.render(context);
    topBarResult.lines.forEach(line => console.log(line));
    console.log('═'.repeat(this.terminalWidth));

    // 根据交互模式渲染不同面板
    if (this.interactionMode === 'inputShares') {
      const orderBookResult = this.panels.orderBook.render(context);
      console.log(orderBookResult.lines.join('\n'));
      const inputResult = this.panels.input.render(context);
      console.log(inputResult.lines.join('\n'));
    } else if (this.interactionMode === 'confirm' || this.interactionMode === 'submitting') {
      const orderBookResult = this.panels.orderBook.render(context);
      console.log(orderBookResult.lines.join('\n'));
      const confirmResult = this.panels.confirm.render(context);
      console.log(confirmResult.lines.join('\n'));
    } else if (this.interactionMode === 'askAutoClear') {
      const orderBookResult = this.panels.orderBook.render(context);
      console.log(orderBookResult.lines.join('\n'));
      const autoClearAskResult = this.panels.autoClearAsk.render(context);
      console.log(autoClearAskResult.lines.join('\n'));
    } else {
      // 正常模式：上左右+底部布局
      const orderBookResult = this.panels.orderBook.render(context);
      const leftLines = orderBookResult.lines;
      this.currentOrderBookWidth = orderBookResult.width;

      const rightLines = [];

      // 构建右侧内容（不包括追踪订单和盈亏）
      if (this.panels.myOrders.isVisible(context)) {
        const myOrdersResult = this.panels.myOrders.render(context);
        rightLines.push(...myOrdersResult.lines);
      }

      if (this.panels.eventHistory.isVisible(context)) {
        const eventResult = this.panels.eventHistory.render(context);
        rightLines.push(...eventResult.lines);
      }

      this.renderSideBySide(leftLines, rightLines);

      // 底部区域：追踪订单和盈亏
      const bottomLines = [];

      if (this.panels.trackedOrders.isVisible(context)) {
        console.log('─'.repeat(this.terminalWidth));
        const trackedResult = this.panels.trackedOrders.render(context);
        trackedResult.lines.forEach(line => console.log(line));
      }

      if (this.panels.profitLoss.isVisible(context)) {
        console.log('─'.repeat(this.terminalWidth));
        const profitLossResult = this.panels.profitLoss.render(context);
        profitLossResult.lines.forEach(line => console.log(line));
      }

      if (this.submitMessage) {
        console.log('');
        console.log(`${this.submitMessage}`);
      }
    }
  }

  /**
   * 计算字符串显示宽度
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
   * 并排渲染左右两列
   */
  renderSideBySide(leftLines, rightLines) {
    const maxLines = Math.max(leftLines.length, rightLines.length);
    const leftWidth = this.currentOrderBookWidth || 55;
    const rightWidth = 58;

    for (let i = 0; i < maxLines; i++) {
      const leftLine = leftLines[i] || '';
      const rightLine = rightLines[i] || '';

      const leftPlain = leftLine.replace(/\x1b\[[0-9;]*m/g, '');
      const leftDisplayWidth = this.getDisplayWidth(leftPlain);
      const leftPadding = leftWidth - leftDisplayWidth;

      const paddedLeft = leftLine + ' '.repeat(Math.max(0, leftPadding));
      console.log(`${paddedLeft} │ ${rightLine}`);
    }
  }

  /**
   * 刷新订单簿数据
   */
  async refreshOrderBook() {
    try {
      const books = await this.orderBookAPI.getBothOrderBooks();
      this.orderBooks.YES = books.YES;
      this.orderBooks.NO = books.NO;
    } catch (error) {
      console.error('刷新订单簿失败:', error.message);
    }
  }

  /**
   * 刷新余额数据
   */
  async refreshInventory() {
    try {
      const inventory = await this.inventoryManager.getFullInventory(
        this.accountAddress,
        this.tokenIds
      );

      const previousLength = this.eventHistory.length;
      this.detectBalanceChanges(inventory, this.previousInventory);

      if (this.eventHistory.length > previousLength) {
        this.playBeep();
      }

      this.previousInventory = inventory;
    } catch (error) {
      console.error('刷新余额失败:', error.message);
    }
  }

  /**
   * 刷新 Open Orders 数据
   */
  async refreshOpenOrders() {
    if (!this.sdkEnabled) return;

    try {
      const result = await this.sdk.getOpenOrders({
        topicId: this.topicId,
        limit: 20
      });

      const previousLength = this.eventHistory.length;
      this.detectOrderChanges(result);

      if (this.eventHistory.length > previousLength) {
        this.playBeep();
      }

      const currentOrderCount = result.list ? result.list.length : 0;
      if (this.previousOrderCount > 0 && currentOrderCount < this.previousOrderCount) {
        const reducedCount = this.previousOrderCount - currentOrderCount;
        this.showMessage(`🔔 订单数量减少 ${reducedCount} 个 (${this.previousOrderCount} → ${currentOrderCount})`, 3000);
      }

      this.openOrders = result;
      this.previousOrderCount = currentOrderCount;

      if (this.autoClearManager) {
        const closedOrders = await this.sdk.getClosedOrders({
          topicId: this.topicId,
          limit: 50
        });
        await this.autoClearManager.updateOrderStatus(closedOrders.list);
      }

    } catch (error) {
      console.error('刷新订单失败:', error.message);
      this.openOrders = { error: error.message, list: [], total: 0 };
    }
  }

  /**
   * 刷新所有数据
   */
  async refresh() {
    const refreshTasks = [
      this.refreshOrderBook(),
      this.refreshInventory()
    ];

    if (this.sdkEnabled) {
      refreshTasks.push(this.refreshOpenOrders());
    }

    await Promise.all(refreshTasks);
    this.render();
  }

  /**
   * 启动看板
   */
  async start() {
    this.isRunning = true;

    await this.initialize();

    console.log('正在加载交易看板数据...');

    await this.refresh();

    this.timer = setInterval(() => {
      this.refresh();
    }, this.refreshInterval);
  }

  /**
   * 停止看板
   */
  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    console.log('\n已退出交易看板');
  }
}

// 启动看板
async function main() {
  const topicId = process.argv[2] || '789';

  console.log('='.repeat(85));
  console.log('预测市场交易看板 V2');
  console.log('='.repeat(85));
  console.log(`使用 Topic ID: ${topicId}`);
  console.log('提示: 可通过命令行参数指定 Topic ID，例如: node tradingDashboard_v2.js 123');
  console.log('='.repeat(85));
  console.log();

  const dashboard = new TradingDashboard(topicId);

  process.on('SIGINT', () => {
    dashboard.stop();
    process.exit(0);
  });

  await dashboard.start();
}

if (require.main === module) {
  main().catch(error => {
    console.error('错误:', error);
    process.exit(1);
  });
}

module.exports = TradingDashboard;
