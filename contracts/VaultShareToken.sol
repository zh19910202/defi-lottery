// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title VaultShareToken
 * @dev 代表用户在Vault中的权益份额的ERC20代币
 * 这个代币只能由Vault合约铸造和销毁
 */
contract VaultShareToken is ERC20, ERC20Burnable, Ownable {
    address public vault;

    // 事件定义
    event VaultAddressSet(address indexed oldVault, address indexed newVault);

    /**
     * @dev 创建一个新的VaultShareToken
     * @param _name 代币名称
     * @param _symbol 代币符号
     */
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) Ownable() {}

    /**
     * @dev 设置Vault合约地址
     * @param _vault Vault合约地址
     * 只有合约拥有者可以调用此函数
     */
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "VaultShareToken: vault cannot be zero address");
        address oldVault = vault;
        vault = _vault;
        emit VaultAddressSet(oldVault, _vault);
    }

    /**
     * @dev 铸造新的权益代币
     * @param to 接收者地址
     * @param amount 铸造金额
     * 只有Vault合约可以调用此函数
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == vault, "VaultShareToken: only vault can mint");
        _mint(to, amount);
    }

    /**
     * @dev 重写burn函数，确保只有Vault可以销毁代币
     * @param amount 销毁金额
     */
    function burn(uint256 amount) public override {
        require(msg.sender == vault, "VaultShareToken: only vault can burn");
        super.burn(amount);
    }

    /**
     * @dev 重写burnFrom函数，确保只有Vault可以从指定地址销毁代币
     * @param account 销毁代币的地址
     * @param amount 销毁金额
     */
    function burnFrom(address account, uint256 amount) public override {
        require(msg.sender == vault, "VaultShareToken: only vault can burn");
        super.burnFrom(account, amount);
    }
}
