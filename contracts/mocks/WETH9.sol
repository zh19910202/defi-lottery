// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WETH9
 * @dev Wrapped Ether (WETH) implementation
 * This contract implements the ERC20 standard for a wrapped version of Ether
 */
contract WETH9 {
    string public name = "Wrapped Ether";
    string public symbol = "WETH";
    uint8 public decimals = 18;

    event Approval(address indexed src, address indexed guy, uint256 wad);
    event Transfer(address indexed src, address indexed dst, uint256 wad);
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /**
     * @dev Function to deposit ETH and get WETH tokens
     */
    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @dev Function to withdraw ETH by burning WETH tokens
     * @param wad Amount of WETH to burn and ETH to receive
     */
    function withdraw(uint256 wad) public {
        require(balanceOf[msg.sender] >= wad, "WETH: insufficient balance");
        balanceOf[msg.sender] -= wad;
        payable(msg.sender).transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }

    /**
     * @dev Returns the total supply of WETH
     * @return The total supply
     */
    function totalSupply() public view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Approves spender to transfer tokens on behalf of sender
     * @param guy Address of the spender
     * @param wad Amount of tokens to approve
     * @return Whether the approval was successful
     */
    function approve(address guy, uint256 wad) public returns (bool) {
        allowance[msg.sender][guy] = wad;
        emit Approval(msg.sender, guy, wad);
        return true;
    }

    /**
     * @dev Transfers tokens from sender to recipient
     * @param dst Address of recipient
     * @param wad Amount of tokens to transfer
     * @return Whether the transfer was successful
     */
    function transfer(address dst, uint256 wad) public returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    /**
     * @dev Transfers tokens from a specified address to another address
     * @param src Address to transfer tokens from
     * @param dst Address to transfer tokens to
     * @param wad Amount of tokens to transfer
     * @return Whether the transfer was successful
     */
    function transferFrom(address src, address dst, uint256 wad) public returns (bool) {
        require(balanceOf[src] >= wad, "WETH: insufficient balance");

        if (src != msg.sender && allowance[src][msg.sender] != type(uint256).max) {
            require(allowance[src][msg.sender] >= wad, "WETH: insufficient allowance");
            allowance[src][msg.sender] -= wad;
        }

        balanceOf[src] -= wad;
        balanceOf[dst] += wad;

        emit Transfer(src, dst, wad);

        return true;
    }

    // Function to receive Ether directly to the contract
    receive() external payable {
        deposit();
    }
}
