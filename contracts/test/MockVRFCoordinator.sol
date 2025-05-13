// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockVRFCoordinator {
    address private callbackContract;
    uint256 private requestCounter;

    // 设置回调合约地址
    function setCallbackContract(address _callbackContract) external {
        callbackContract = _callbackContract;
    }

    // 模拟VRFCoordinatorV2的requestRandomWords函数
    function requestRandomWords(
        bytes32 keyHash,
        uint64 subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external returns (uint256) {
        requestCounter++;
        uint256 requestId = requestCounter;

        // 生成随机数组
        uint256[] memory randomWords = new uint256[](numWords);
        for (uint32 i = 0; i < numWords; i++) {
            // 简单的伪随机数生成，用于测试
            randomWords[i] = uint256(
                keccak256(abi.encodePacked(block.timestamp, block.prevrandao, requestId, i))
            );
        }

        // 如果设置了回调合约，自动调用fulfillRandomWords
        if (callbackContract != address(0)) {
            fulfillRandomWords(requestId, callbackContract, randomWords);
        }

        return requestId;
    }

    // 手动调用的fulfillRandomWords函数
    function fulfillRandomWords(
        uint256 requestId,
        address consumerAddress,
        uint256[] memory randomWords
    ) public {
        // 调用消费者合约的fulfillRandomWords函数
        (bool success, ) = consumerAddress.call(
            abi.encodeWithSignature(
                "rawFulfillRandomWords(uint256,uint256[])",
                requestId,
                randomWords
            )
        );
        require(success, "Callback failed");
    }
}
