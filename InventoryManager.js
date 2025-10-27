const { ethers } = require('ethers');

/**
 * 预测市场库存管理系统
 * 用于查询BSC链上的NFT和USDT余额
 */
class InventoryManager {
  constructor(rpcUrl = 'https://bsc.publicnode.com') {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // 合约地址配置
    this.config = {
      nft: '0xad1a38cec043e70e83a3ec30443db285ed10d774',
      usdt: '0x55d398326f99059ff775485246999027b3197955'
    };

    // ABI定义
    this.abis = {
      erc20: [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)'
      ],
      erc721: [
        'function balanceOf(address owner) view returns (uint256)',
        'function name() view returns (string)',
        'function symbol() view returns (string)'
      ],
      erc1155: [
        'function balanceOf(address account, uint256 id) view returns (uint256)',
        'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
        'function supportsInterface(bytes4 interfaceId) view returns (bool)'
      ]
    };

    // 合约实例
    this.contracts = {
      usdt: new ethers.Contract(this.config.usdt, this.abis.erc20, this.provider),
      nft: new ethers.Contract(this.config.nft, this.abis.erc1155, this.provider)
    };
  }

  /**
   * 获取USDT余额
   * @param {string} address - 账户地址
   * @returns {Object} 余额信息
   */
  async getUSDTBalance(address) {
    const balance = await this.contracts.usdt.balanceOf(address);
    const decimals = await this.contracts.usdt.decimals();
    const symbol = await this.contracts.usdt.symbol();

    return {
      raw: balance.toString(),
      formatted: ethers.formatUnits(balance, decimals),
      symbol: symbol,
      decimals: Number(decimals)
    };
  }

  /**
   * 获取单个NFT token的余额 (ERC1155)
   * @param {string} address - 账户地址
   * @param {string|number} tokenId - Token ID
   * @returns {Object} NFT余额信息
   */
  async getNFTBalance(address, tokenId) {
    const balance = await this.contracts.nft.balanceOf(address, tokenId);

    return {
      tokenId: tokenId.toString(),
      raw: balance.toString(),
      formatted: ethers.formatEther(balance),
      address: address
    };
  }

  /**
   * 批量获取NFT余额 (ERC1155)
   * @param {string} address - 账户地址
   * @param {Array<string|number>} tokenIds - Token ID数组
   * @returns {Array<Object>} NFT余额信息数组
   */
  async getNFTBalances(address, tokenIds) {
    const addresses = new Array(tokenIds.length).fill(address);
    const balances = await this.contracts.nft.balanceOfBatch(addresses, tokenIds);

    return tokenIds.map((tokenId, index) => ({
      tokenId: tokenId.toString(),
      raw: balances[index].toString(),
      formatted: ethers.formatEther(balances[index]),
      address: address
    }));
  }

  /**
   * 获取完整的库存信息
   * @param {string} address - 账户地址
   * @param {Array<string|number>} tokenIds - 可选的Token ID数组
   * @returns {Object} 完整库存信息
   */
  async getFullInventory(address, tokenIds = []) {
    const inventory = {
      address: address,
      usdt: null,
      nfts: []
    };

    // 获取USDT余额
    inventory.usdt = await this.getUSDTBalance(address);

    // 获取NFT余额
    if (tokenIds.length > 0) {
      inventory.nfts = await this.getNFTBalances(address, tokenIds);
    }

    return inventory;
  }

  /**
   * 格式化库存信息为字符串
   * @param {Object} inventory - 库存数据对象
   * @param {Object} tokenConfig - 可选的Token配置映射 (例如: {YES: 'tokenId1', NO: 'tokenId2'})
   * @returns {string} 格式化的库存信息字符串
   */
  formatInventory(inventory, tokenConfig = null) {
    let output = [];

    output.push('='.repeat(60));
    output.push('预测市场库存查询');
    output.push('='.repeat(60));
    output.push('');

    // 打印账户信息
    output.push(`账户地址: ${inventory.address}`);
    output.push('');

    // 打印USDT余额
    output.push('【USDT余额】');
    output.push(`  余额: ${inventory.usdt.formatted} ${inventory.usdt.symbol}`);
    output.push('');

    // 打印NFT库存
    output.push('【NFT库存 (ERC1155)】');
    if (inventory.nfts.length > 0) {
      // 创建tokenId到标签的映射
      let tokenLabels = {};
      if (tokenConfig) {
        for (const [label, id] of Object.entries(tokenConfig)) {
          tokenLabels[id.toString()] = label;
        }
      }

      inventory.nfts.forEach((nft, index) => {
        const label = tokenLabels[nft.tokenId] || `Token ${index + 1}`;
        output.push(`  ${label}:`);
        output.push(`    ID: ${nft.tokenId}`);
        output.push(`    数量: ${nft.formatted} ether`);
        output.push('');
      });
    } else {
      output.push('  未指定Token ID');
      output.push('  提示: 使用 printInventory(address, [tokenId1, tokenId2, ...])');
      output.push('');
    }

    output.push('='.repeat(60));

    return output.join('\n');
  }

  /**
   * 打印库存信息
   * @param {string} address - 账户地址
   * @param {Array<string|number>} tokenIds - 可选的Token ID数组
   * @param {Object} tokenConfig - 可选的Token配置映射 (例如: {YES: 'tokenId1', NO: 'tokenId2'})
   */
  async printInventory(address, tokenIds = [], tokenConfig = null) {
    const inventory = await this.getFullInventory(address, tokenIds);
    console.log(this.formatInventory(inventory, tokenConfig));
    return inventory;
  }
}

module.exports = InventoryManager;
