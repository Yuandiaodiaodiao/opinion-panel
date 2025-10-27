# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BSC (Binance Smart Chain) prediction market trading tool with SDK for Opinion Trade platform. The project provides an interactive terminal dashboard for trading prediction market positions (YES/NO tokens) with automated inventory clearing capabilities.

## Architecture

### Core Components

1. **OpinionTradeSDK** (`src/sdk/OpinionTradeSDK.js`)
   - Main SDK for interacting with Opinion Trade API
   - Handles order creation, signing, submission, cancellation
   - Auto-fetches topic information via TopicAPI
   - Supports proxy configuration via `HTTPS_PROXY` environment variable
   - Requires `AUTHORIZATION_TOKEN` for authenticated API calls

2. **TradingDashboard** (`tradingDashboard.js`)
   - Interactive terminal UI with grid-based navigation
   - Panel-based architecture (see `src/dashboard/panels/`)
   - Real-time order book monitoring and balance tracking
   - Keyboard-driven interface (arrow keys, tab, enter, ESC)
   - Uses GridManager for unified selection model across panels

3. **AutoClearManager** (`AutoClearManager.js`)
   - Automatically places reverse sell orders after buy orders fill
   - Tracks order status and calculates safe clearing prices
   - Persists state to `.autoclear_data/topic_{topicId}.json`
   - Only processes completely filled orders (status=2)

4. **OrderBookAPI** (`src/sdk/OrderBookAPI.js`)
   - Fetches real-time order book depth data
   - Separate YES/NO token order books

5. **TopicAPI** (`src/sdk/TopicAPI.js`)
   - Fetches and caches topic metadata (token IDs, titles)
   - Cache expires after 24 hours
   - Stored in `.cache/topics/topic_{topicId}.json`

6. **InventoryManager** (`InventoryManager.js`)
   - Queries on-chain balances for ERC-1155 NFT tokens and USDT
   - Uses ethers.js with BSC RPC endpoint

### Panel System

Panels extend `PanelBase` and implement:
- `isVisible(context)` - Determines if panel should render
- `render(context)` - Returns `{ lines: string[], width: number }`
- `buildGrid(context)` - Returns selectable items for navigation

Available panels: TopBar, OrderBook, MyOrders, EventHistory, ProfitLoss, TrackedOrders, Input, Confirm, AutoClearAsk

## Environment Configuration

Required `.env` variables:
- `PRIVATE_KEY` - Wallet private key (owner of Gnosis Safe)
- `MAKER_ADDRESS` - Gnosis Safe address
- `AUTHORIZATION_TOKEN` - JWT token from Opinion Trade (get from browser network tab)

Optional:
- `HTTPS_PROXY` - HTTP/HTTPS proxy (format: `http://127.0.0.1:7890`)
- `TELEGRAM_BOT_TOKEN` - For notifications
- `TELEGRAM_CHAT_ID` - Telegram channel/user ID

## Common Commands

```bash
# Install dependencies
npm install

# Run trading dashboard (default topic 789)
npm start

# Run with specific topic
npm start 123

# Run dashboard directly
node tradingDashboard.js [topicId]
```

## Key Concepts

### Order Flow
1. SDK fetches topic info to get YES/NO token IDs
2. User selects order book item ’ enters shares ’ confirms
3. SDK builds order params ’ signs with EIP-712 ’ submits to API
4. AutoClearManager tracks filled buy orders ’ places reverse sell orders

### Price Handling
- API accepts prices as percentages (0-100, e.g., "90.00")
- Internal calculations use decimals (0-1, e.g., 0.90)
- Convert: `apiPrice = decimalPrice * 100`

### Order Tracking
- Open orders: status=1 (queryType=1)
- Closed orders: status=2 (completed) or status=6 (failed) (queryType=2)
- AutoClear only processes status=2 with full fill amount

### Profit/Loss Calculation
- Split: Buy at 0.5 (net inflow)
- Buy: Buy at lastPrice (net inflow)
- Merge: Sell at 0.5 (net outflow)
- Sell: Sell at lastPrice (net outflow)
- P/L = Outflow - Inflow - Fees

## Contract Addresses (BSC)

- NFT (ERC-1155): `0xad1a38cec043e70e83a3ec30443db285ed10d774`
- USDT: `0x55d398326f99059ff775485246999027b3197955`
- Chain ID: 56

## API Endpoints

Base URL: `https://proxy.opinion.trade:8443/api/bsc/api`

- Submit order: `/v2/order/limit`
- Query orders: `/v2/order/account/list`
- Query trades: `/v2/order/transaction/list`
- Cancel order: `/v1/order/cancel/order`
- Topic info: `/v2/topic/{topicId}`

## Technical Notes

- Dashboard uses raw terminal mode with keypress events
- Grid navigation supports arrow keys, Enter (execute), Tab (toggle YES/NO)
- All HTTP requests support proxy via `HttpsProxyAgent`
- Order signing uses EIP-712 typed data with Gnosis Safe compatibility
- Chinese characters counted as 2-width for terminal layout
- Telegram notifications sent on order fill/remove events
