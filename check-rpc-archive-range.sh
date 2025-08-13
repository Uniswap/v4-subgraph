#!/bin/bash

# Script to check the oldest block with WETH Transfer event logs in an RPC archive
# Usage: ./check-rpc-archive-range.sh <RPC_URL>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <RPC_URL>"
    echo "Example: $0 https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
    exit 1
fi

RPC_URL=$1

# Configuration: Chain ID to WETH address mapping
# Using a function instead of associative array for compatibility
get_weth_address() {
    local chain_id=$1
    case $chain_id in
        1) echo "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" ;;        # Ethereum Mainnet
        10) echo "0x4200000000000000000000000000000000000006" ;;       # Optimism
        56) echo "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" ;;       # BSC (WBNB)
        137) echo "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" ;;      # Polygon (WMATIC)
        42161) echo "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" ;;    # Arbitrum One
        8453) echo "0x4200000000000000000000000000000000000006" ;;     # Base
        43114) echo "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7" ;;    # Avalanche (WAVAX)
        250) echo "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83" ;;      # Fantom (WFTM)
        11155111) echo "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9" ;; # Sepolia
        *) echo "" ;;
    esac
}

# Transfer event signature for ERC20 (including WETH)
# Transfer(address indexed from, address indexed to, uint256 value)
TRANSFER_TOPIC="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to get chain ID from RPC
get_chain_id() {
    local response=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
        2>/dev/null)
    
    local chain_hex=$(echo "$response" | grep -o '"result":"0x[^"]*"' | cut -d'"' -f4)
    if [ -z "$chain_hex" ]; then
        echo "0"
        return 1
    fi
    
    echo $((16#${chain_hex#0x}))
    return 0
}

# Function to get latest block
get_latest_block() {
    local response=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        2>/dev/null)
    
    local block_hex=$(echo "$response" | grep -o '"result":"0x[^"]*"' | cut -d'"' -f4)
    if [ -z "$block_hex" ]; then
        echo "0"
        return 1
    fi
    
    echo $((16#${block_hex#0x}))
    return 0
}

# Function to check if WETH Transfer logs exist at a specific block range
check_weth_transfer_logs() {
    local weth_address=$1
    local block_num=$2
    local block_hex=$(printf "0x%x" $block_num)
    
    # Try to get logs for a range of 100 blocks
    local to_block=$((block_num + 100))
    local to_hex=$(printf "0x%x" $to_block)
    
    # Query Transfer events from WETH contract
    local response=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getLogs\",\"params\":[{\"address\":\"$weth_address\",\"topics\":[\"$TRANSFER_TOPIC\"],\"fromBlock\":\"$block_hex\",\"toBlock\":\"$to_hex\"}],\"id\":1}" \
        2>/dev/null)
    
    if echo "$response" | grep -q '"error"'; then
        return 1
    elif echo "$response" | grep -q '"result":\['; then
        return 0
    else
        return 1
    fi
}

# Main execution
echo -e "${BLUE}===== RPC Archive Range Checker =====${NC}\n"

# Get chain ID
echo "Getting chain information..."
CHAIN_ID=$(get_chain_id)
if [ $CHAIN_ID -eq 0 ]; then
    echo -e "${RED}Error: Could not get chain ID from RPC${NC}"
    exit 1
fi

# Get chain name
case $CHAIN_ID in
    1) CHAIN_NAME="Ethereum Mainnet" ;;
    10) CHAIN_NAME="Optimism" ;;
    56) CHAIN_NAME="BSC" ;;
    137) CHAIN_NAME="Polygon" ;;
    42161) CHAIN_NAME="Arbitrum One" ;;
    8453) CHAIN_NAME="Base" ;;
    43114) CHAIN_NAME="Avalanche" ;;
    250) CHAIN_NAME="Fantom" ;;
    11155111) CHAIN_NAME="Sepolia" ;;
    *) CHAIN_NAME="Unknown" ;;
esac

echo -e "${GREEN}✓ Chain: $CHAIN_NAME (ID: $CHAIN_ID)${NC}"

# Get WETH address for this chain
WETH_ADDRESS=$(get_weth_address $CHAIN_ID)
if [ -z "$WETH_ADDRESS" ]; then
    echo -e "${YELLOW}Warning: WETH address not configured for chain ID $CHAIN_ID${NC}"
    echo "Please add WETH address for this chain to the script configuration"
    exit 1
fi

echo -e "${GREEN}✓ WETH Address: $WETH_ADDRESS${NC}"

# Get latest block
echo -e "\nFetching latest block..."
LATEST_BLOCK=$(get_latest_block)
if [ $LATEST_BLOCK -eq 0 ]; then
    echo -e "${RED}Error: Could not get latest block from RPC${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Latest block: $LATEST_BLOCK${NC}"

# Binary search for oldest block with WETH Transfer logs
echo -e "\n${BLUE}Searching for oldest block with WETH Transfer logs...${NC}"
echo "This may take a few minutes..."

# Add debug mode option
DEBUG_MODE=${DEBUG:-false}

low=0
high=$LATEST_BLOCK
oldest_block=$LATEST_BLOCK
iteration=0

while [ $low -le $high ]; do
    mid=$(( (low + high) / 2 ))
    iteration=$((iteration + 1))
    
    # Show progress
    printf "\rChecking block: $mid (range: $low - $high)    "
    
    # Show first few iterations in detail for debugging
    if [ $iteration -le 3 ] && [ "$DEBUG_MODE" = "true" ]; then
        echo -e "\n${YELLOW}Debug iteration $iteration:${NC}"
        block_hex=$(printf "0x%x" $mid)
        to_block=$((mid + 100))
        to_hex=$(printf "0x%x" $to_block)
        echo "  Testing blocks $mid to $to_block"
        echo "  curl command:"
        echo "  curl -X POST \"$RPC_URL\" -H \"Content-Type: application/json\" \\"
        echo "    -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_getLogs\",\"params\":[{\"address\":\"$WETH_ADDRESS\",\"topics\":[\"$TRANSFER_TOPIC\"],\"fromBlock\":\"$block_hex\",\"toBlock\":\"$to_hex\"}],\"id\":1}'"
    fi
    
    if check_weth_transfer_logs "$WETH_ADDRESS" $mid; then
        oldest_block=$mid
        high=$((mid - 1))
    else
        low=$((mid + 1))
    fi
done

echo -e "\n"

# Verify the result
echo -e "${BLUE}Verifying result...${NC}"
if check_weth_transfer_logs "$WETH_ADDRESS" $oldest_block; then
    echo -e "${GREEN}✓ Found oldest block with WETH Transfer logs: $oldest_block${NC}"
    
    # Get block timestamp
    block_hex=$(printf "0x%x" $oldest_block)
    block_info=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockByNumber\",\"params\":[\"$block_hex\",false],\"id\":1}" \
        2>/dev/null)
    
    timestamp_hex=$(echo "$block_info" | grep -o '"timestamp":"0x[^"]*"' | cut -d'"' -f4)
    if [ ! -z "$timestamp_hex" ]; then
        timestamp=$((16#${timestamp_hex#0x}))
        date_str=$(date -r $timestamp 2>/dev/null || date -d @$timestamp 2>/dev/null || echo "Unknown")
        echo -e "  Block date: $date_str"
    fi
    
    # Try to get actual Transfer events count in first 1000 blocks
    echo -e "\n${BLUE}Checking Transfer activity...${NC}"
    to_block=$((oldest_block + 1000))
    from_hex=$(printf "0x%x" $oldest_block)
    to_hex=$(printf "0x%x" $to_block)
    
    # Show the actual curl command for debugging
    echo -e "\n${YELLOW}Debug: Running curl command:${NC}"
    echo "curl -s -X POST \"$RPC_URL\" \\"
    echo "  -H \"Content-Type: application/json\" \\"
    echo "  -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_getLogs\",\"params\":[{\"address\":\"$WETH_ADDRESS\",\"topics\":[\"$TRANSFER_TOPIC\"],\"fromBlock\":\"$from_hex\",\"toBlock\":\"$to_hex\"}],\"id\":1}'"
    echo ""
    
    logs_response=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getLogs\",\"params\":[{\"address\":\"$WETH_ADDRESS\",\"topics\":[\"$TRANSFER_TOPIC\"],\"fromBlock\":\"$from_hex\",\"toBlock\":\"$to_hex\"}],\"id\":1}" \
        2>/dev/null)
    
    if echo "$logs_response" | grep -q '"result":\['; then
        transfer_count=$(echo "$logs_response" | grep -o '"blockNumber"' | wc -l)
        echo -e "${GREEN}✓ Found $transfer_count Transfer events in blocks $oldest_block-$to_block${NC}"
    fi
else
    echo -e "${RED}✗ Could not verify WETH Transfer logs availability${NC}"
    exit 1
fi

# Calculate coverage
block_range=$((LATEST_BLOCK - oldest_block + 1))

echo -e "\n${BLUE}===== Archive Summary =====${NC}"
echo -e "Chain:          $CHAIN_NAME (ID: $CHAIN_ID)"
echo -e "WETH Contract:  $WETH_ADDRESS"
echo -e "Oldest block:   $oldest_block"
echo -e "Latest block:   $LATEST_BLOCK"
echo -e "Total blocks:   $(printf "%'d" $block_range)"
echo -e "Coverage:       blocks $oldest_block to $LATEST_BLOCK"

echo -e "\n${GREEN}✓ This RPC can provide event logs starting from block $oldest_block${NC}"
echo -e "${GREEN}✓ Subgraph can sync from this block onwards${NC}"
