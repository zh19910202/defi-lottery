// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockVRFCoordinatorV2 {
    event RandomWordsRequested(
        bytes32 indexed keyHash,
        uint256 requestId,
        uint256 preSeed,
        uint64 subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords,
        address indexed sender
    );

    event RandomWordsFulfilled(
        uint256 indexed requestId,
        uint256 indexed subId,
        uint96 payment,
        bool success
    );

    uint256 private nonce;
    mapping(uint256 => address) private s_requests;

    function requestRandomWords(
        bytes32 keyHash,
        uint64 subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external returns (uint256) {
        uint256 requestId = uint256(
            keccak256(abi.encodePacked(keyHash, nonce++))
        );
        s_requests[requestId] = msg.sender;

        emit RandomWordsRequested(
            keyHash,
            requestId,
            uint256(blockhash(block.number - 1)),
            subId,
            minimumRequestConfirmations,
            callbackGasLimit,
            numWords,
            msg.sender
        );

        return requestId;
    }

    function fulfillRandomWords(
        uint256 requestId,
        address consumer,
        uint256[] memory words
    ) external {
        // require(s_requests[requestId] == consumer, "Wrong consumer");
        // delete s_requests[requestId];

        emit RandomWordsFulfilled(requestId, 1, 0, true);

        VRFConsumerBaseV2(consumer).rawFulfillRandomWords(requestId, words);
    }
}

interface VRFConsumerBaseV2 {
    function rawFulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) external;
}
