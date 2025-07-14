# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Development

- `yarn build` - Generate TypeScript types from GraphQL schema and build the subgraph
- `yarn buildonly` - Build the subgraph without regenerating types
- `yarn codegen` - Generate TypeScript types from GraphQL schema (outputs to `src/types/`)
- `yarn lint` - Run ESLint on TypeScript files
- `yarn lint:fix` - Run ESLint with auto-fix
- `yarn test` - Run unit tests with Docker (requires Docker and postgres installed)

### Deployment

All deployments require a `.env` file with `DEPLOY_KEY` for authenticated deployments:

- `yarn deploy:sepolia` - Deploy to Sepolia testnet
- `yarn deploy:local` - Deploy to local graph node (http://localhost:8020)
- `yarn deploy:kittycorn` - Deploy to mainnet

For new deployments, first run the corresponding `create:*` command.

## Architecture Overview

This is a Uniswap V4 subgraph modified for Kittycorn, tracking DEX activity and lending functionality. The subgraph indexes three main contracts:

### Core Data Sources

1. **PoolManager** (Uniswap V4 core)

   - Handles pool initialization, liquidity modifications, and swaps
   - Tracks tokens, pools, ticks, and transaction data

2. **PositionManager** (NFT positions)

   - Manages liquidity positions as NFTs
   - Tracks subscriptions, unsubscriptions, and transfers

3. **KittycornBank** (Lending protocol)
   - Manages borrowing/lending functionality
   - Handles collateral configuration and liquidations

### Key Mappings

- **Event Handlers**: Located in `src/mappings/`, each file handles specific contract events
- **Utilities**: `src/utils/` contains pricing logic, token helpers, and chain-specific configurations
- **Chain Configuration**: `src/utils/chains.ts` defines network-specific settings (addresses, tokens, etc.)

### Data Flow

1. Events from contracts trigger mapping handlers
2. Handlers create/update entities defined in `schema.graphql`
3. Price calculations use wrapped native token pools (e.g., WETH/USDC)
4. Tokenized assets (tTokens) are mapped to their underlying assets for pricing

### Adding New Chains

1. Add network configuration in `src/utils/chains.ts`
2. Create entry in `networks.json` with factory address
3. Update deployment scripts in `package.json`
4. Deploy using yarn commands above

### Testing

Tests use matchstick-as framework and require Docker. Test files are in `tests/` directory mirroring the source structure.

## Commit Message Guidelines

When creating git commits, use concise, descriptive messages without the following signatures:

```
🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Use standard conventional commit format instead:

```
feat: add new feature
fix: resolve bug issue
chore: update dependencies
refactor: improve code structure
```

# Summary instructions

When you are using compact, please focus on test output and code changes
