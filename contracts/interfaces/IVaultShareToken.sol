// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IVaultShareToken
 * @dev 定义了Vault权益代币的接口
 */
interface IVaultShareToken {
    /**
     * @dev 设置Vault合约地址
     * @param _vault Vault合约地址
     */
    function setVault(address _vault) external;

    /**
     * @dev 铸造新的权益代币
     * @param to 接收者地址
     * @param amount 铸造金额
     */
    function mint(address to, uint256 amount) external;

    /**
     * @dev 销毁代币
     * @param amount 销毁金额
     */
    function burn(uint256 amount) external;

    /**
     * @dev 从指定地址销毁代币
     * @param account 销毁代币的地址
     * @param amount 销毁金额
     */
    function burnFrom(address account, uint256 amount) external;

    /**
     * @dev 返回代币总供应量
     * @return 代币总供应量
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev 返回指定账户的代币余额
     * @param account 查询余额的账户
     * @return 代币余额
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev 获取Vault合约地址
     * @return Vault合约地址
     */
    function vault() external view returns (address);
}
