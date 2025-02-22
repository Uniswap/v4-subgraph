# Uniswap V4 Subgraph

### Running Unit Tests

1. Install [Docker](https://docs.docker.com/get-docker/) if you don't have it already
2. Install postgres: `brew install postgresql`
3. `yarn run build:docker`
4. `yarn run test`

### Adding New Chains

1. Create a new subgraph config in `src/utils/chains.ts`. This will require adding a new `<NETWORK_NAME>_NETWORK_NAME` const for the corresponding network.
2. Add a new entry in `networks.json` for the new chain. The network name should be derived from the CLI Name in The Graph's [supported networks documenation](https://thegraph.com/docs/en/developing/supported-networks/). The factory address can be derived from Uniswap's deployments documentation (not yet available).
3. Deploy subgraph, run the following command:
#### Deploy to The Graph
```
graph deploy <SUBGRAPH_NAME>
```
#### Deploy to Alchemy
```
yarn run deploy:alchemy --
  <SUBGRAPH_NAME>
  --version-label <VERSION_LABEL>
  --deploy-key <DEPLOYMENT_KEY>
  --network <NETWORK_NAME>
```
