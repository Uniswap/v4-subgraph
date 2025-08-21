#!/bin/bash

# Script to check the oldest block with available data in an RPC archive
# Usage: ./check-rpc-archive-range.sh <RPC_URL>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <RPC_URL>"
    echo "Example: $0 https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
    exit 1
fi

RPC_URL=$1

# Configuration variables

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

# Function to check if block has available data using eth_getBlockReceipts
check_block_has_data() {
    local block_num=$1
    local block_hex=$(printf "0x%x" $block_num)
    
    # Use eth_getBlockReceipts to check if block has any data
    local response=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockReceipts\",\"params\":[\"$block_hex\"],\"id\":1}" \
        --max-time 10 \
        2>/dev/null | head -c 1000)  # Limit response to first 1000 chars
    
    if echo "$response" | grep -q '"error"'; then
        # Block doesn't exist or method not supported
        return 1
    elif echo "$response" | grep -q '"result":null'; then
        # Block exists but no receipts
        return 1
    elif echo "$response" | grep -q '"result":\[\]'; then
        # Empty receipts array
        return 1
    elif echo "$response" | grep -q '"result":\['; then
        # Has receipts
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

# Get latest block
echo -e "\nFetching latest block..."
LATEST_BLOCK=$(get_latest_block)
if [ $LATEST_BLOCK -eq 0 ]; then
    echo -e "${RED}Error: Could not get latest block from RPC${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Latest block: $LATEST_BLOCK${NC}"

# Binary search for oldest block with available data
echo -e "\n${BLUE}Searching for oldest block with available data...${NC}"
echo "This may take a few minutes..."

low=0
high=$LATEST_BLOCK
oldest_block=$LATEST_BLOCK
iteration=0

echo -e "\n${YELLOW}Debug: Running curl command:${NC}"
mid=$(( (low + high) / 2 ))
block_hex=$(printf "0x%x" $mid)
echo "curl -X POST \"$RPC_URL\"\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockReceipts\",\"params\":[\"$block_hex\"],\"id\":1}'"
echo ""

while [ $low -le $high ]; do
    mid=$(( (low + high) / 2 ))
    iteration=$((iteration + 1))
    
    # Show progress
    printf "\rChecking block: $mid (range: $low - $high)    "
    
    if check_block_has_data $mid; then
        oldest_block=$mid
        high=$((mid - 1))
    else
        low=$((mid + 1))
    fi
done

echo -e "\n"

# Verify the result
echo -e "${BLUE}Verifying result...${NC}"
if check_block_has_data $oldest_block; then
    echo -e "${GREEN}✓ Found oldest block with available data: $oldest_block${NC}"
    
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
    
    # Check a few more blocks to verify
    echo -e "\n${BLUE}Verifying data availability...${NC}"
    blocks_with_data=0
    for i in $(seq 0 9); do
        test_block=$((oldest_block + i * 10))
        if [ $test_block -le $LATEST_BLOCK ]; then
            if check_block_has_data $test_block; then
                blocks_with_data=$((blocks_with_data + 1))
            fi
        fi
    done
    echo -e "${GREEN}✓ Found data in $blocks_with_data out of 10 sample blocks${NC}"
else
    echo -e "${RED}✗ Could not verify data availability${NC}"
    exit 1
fi

# Calculate coverage
block_range=$((LATEST_BLOCK - oldest_block + 1))

echo -e "\n${BLUE}===== Archive Summary =====${NC}"
echo -e "Chain:          $CHAIN_NAME (ID: $CHAIN_ID)"
echo -e "Oldest block:   $oldest_block"
echo -e "Latest block:   $LATEST_BLOCK"
echo -e "Total blocks:   $(printf "%'d" $block_range)"
echo -e "Coverage:       blocks $oldest_block to $LATEST_BLOCK"

echo -e "\n${GREEN}✓ This RPC archive has data starting from block $oldest_block${NC}"
echo -e "${GREEN}✓ Subgraph can sync from this block onwards${NC}"
