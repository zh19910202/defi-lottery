// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SortitionSumTree
 * @dev Data structure for implementing weighted probability lottery
 */
library SortitionSumTree {
    struct Node {
        uint256 weight;
        address user;
    }

    struct Tree {
        uint256 K; // tree branching factor
        uint256[] stack;
        uint256[] nodes;
        mapping(address => uint256) addressToNodeIndex;
        mapping(uint256 => address) nodeIndexToAddress;
        uint256 nextNodeIndex;
    }

    /**
     * @dev Initialize a new tree
     * @param _self Tree structure
     * @param _K Branching factor
     */
    function createTree(Tree storage _self, uint256 _K) internal {
        require(_K > 1, "K must be greater than 1");
        _self.K = _K;
        _self.stack = new uint256[](0);
        _self.nodes = new uint256[](0);
        _self.nextNodeIndex = 1;
    }

    /**
     * @dev Set user's weight
     * @param _self Tree structure
     * @param _user User address
     * @param _weight Weight value
     */
    function set(Tree storage _self, address _user, uint256 _weight) internal {
        if (_self.addressToNodeIndex[_user] == 0) {
            // new user
            if (_weight > 0) {
                // add new node
                _self.addressToNodeIndex[_user] = _self.nextNodeIndex;
                _self.nodeIndexToAddress[_self.nextNodeIndex] = _user;
                _self.nextNodeIndex++;

                // update tree
                updateTreeUp(_self, _self.addressToNodeIndex[_user], _weight);
            }
        } else if (_weight > 0) {
            // update existing user
            updateTreeUp(_self, _self.addressToNodeIndex[_user], _weight);
        } else {
            // remove user
            // get node index
            uint256 nodeIndex = _self.addressToNodeIndex[_user];

            // update tree, set weight to 0
            updateTreeUp(_self, nodeIndex, 0);

            // clean up mappings
            delete _self.nodeIndexToAddress[nodeIndex];
            delete _self.addressToNodeIndex[_user];
        }
    }

    /**
     * @dev Update tree upwards
     * @param _self Tree structure
     * @param _nodeIndex Node index
     * @param _weight New weight
     */
    function updateTreeUp(Tree storage _self, uint256 _nodeIndex, uint256 _weight) private {
        uint256 currentNodeIndex = _nodeIndex;
        uint256 newWeight = _weight;

        // expand nodes array
        while (_self.nodes.length < currentNodeIndex) {
            _self.nodes.push(0);
        }

        // update current node
        if (currentNodeIndex == _self.nodes.length) {
            _self.nodes.push(newWeight);
        } else {
            _self.nodes[currentNodeIndex] = newWeight;
        }

        // update parent node
        currentNodeIndex = currentNodeIndex / _self.K;
        while (currentNodeIndex > 0) {
            uint256 parentIndex = currentNodeIndex;
            uint256 sumWeight = 0;

            // calculate sum of all children weights
            for (uint256 i = 1; i <= _self.K; i++) {
                uint256 childIndex = parentIndex * _self.K + i;
                if (childIndex < _self.nodes.length) {
                    sumWeight += _self.nodes[childIndex];
                }
            }

            // update parent node weight
            if (parentIndex == _self.nodes.length) {
                _self.nodes.push(sumWeight);
            } else {
                _self.nodes[parentIndex] = sumWeight;
            }

            // continue upwards
            currentNodeIndex = parentIndex / _self.K;
        }
    }

    /**
     * @dev Select winner based on random value
     * @param _self Tree structure
     * @param _value Random value [0, totalWeight)
     * @return Winner address
     */
    function draw(Tree storage _self, uint256 _value) internal view returns (address) {
        require(_value < _self.nodes[1], "Value must be less than total weight");

        // start from root node
        uint256 currentNodeIndex = 1;

        // traverse down until finding a leaf node
        while (true) {
            // check if it's a leaf node
            bool isLeaf = true;
            for (uint256 i = 1; i <= _self.K; i++) {
                uint256 childIndex = currentNodeIndex * _self.K + i;
                if (childIndex < _self.nodes.length && _self.nodes[childIndex] > 0) {
                    isLeaf = false;
                    break;
                }
            }

            if (isLeaf) {
                return _self.nodeIndexToAddress[currentNodeIndex];
            }

            // find corresponding child node
            uint256 accumulatedWeight = 0;
            for (uint256 i = 1; i <= _self.K; i++) {
                uint256 childIndex = currentNodeIndex * _self.K + i;
                if (childIndex < _self.nodes.length) {
                    uint256 childWeight = _self.nodes[childIndex];
                    if (_value < accumulatedWeight + childWeight) {
                        currentNodeIndex = childIndex;
                        _value -= accumulatedWeight;
                        break;
                    }
                    accumulatedWeight += childWeight;
                }
            }
        }

        // should not reach here
        revert("No winner found");
    }

    /**
     * @dev Get total weight
     * @param _self Tree structure
     * @return Total weight
     */
    function total(Tree storage _self) internal view returns (uint256) {
        if (_self.nodes.length <= 1) {
            return 0;
        }
        return _self.nodes[1];
    }
}
