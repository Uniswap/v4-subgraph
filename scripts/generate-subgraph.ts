import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'

interface ContractConfig {
  address: string
  startBlock: number
}

interface NetworkConfig {
  [contractName: string]: ContractConfig
}

interface NetworksConfig {
  [network: string]: NetworkConfig
}

// Template for different contract types
const contractTemplates = {
  PoolManager: {
    kind: 'ethereum/contract',
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.7',
      language: 'wasm/assemblyscript',
      file: './src/mappings/index.ts',
      entities: ['Pool', 'Token'],
      abis: [
        { name: 'ERC20', file: './abis/ERC20.json' },
        { name: 'ERC20SymbolBytes', file: './abis/ERC20SymbolBytes.json' },
        { name: 'ERC20NameBytes', file: './abis/ERC20NameBytes.json' },
        { name: 'PoolManager', file: './abis/PoolManager.json' },
        // These are actually not needed but they are required by the subgraph code to be generated
        { name: 'EulerSwapFactory', file: './abis/EulerSwapFactory.json' },
        { name: 'ArrakisHookFactory', file: './abis/ArrakisHookFactory.json' },
      ],
      eventHandlers: [
        {
          event: 'Initialize(indexed bytes32,indexed address,indexed address,uint24,int24,address,uint160,int24)',
          handler: 'handleInitialize',
        },
        {
          event: 'ModifyLiquidity(indexed bytes32,indexed address,int24,int24,int256,bytes32)',
          handler: 'handleModifyLiquidity',
        },
        {
          event: 'Swap(indexed bytes32,indexed address,int128,int128,uint160,uint128,int24,uint24)',
          handler: 'handleSwap',
        },
      ],
    },
  },
  PositionManager: {
    kind: 'ethereum/contract',
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.7',
      language: 'wasm/assemblyscript',
      file: './src/mappings/index.ts',
      entities: ['Position'],
      abis: [{ name: 'PositionManager', file: './abis/PositionManager.json' }],
      eventHandlers: [
        {
          event: 'Subscription(indexed uint256,indexed address)',
          handler: 'handleSubscription',
        },
        {
          event: 'Unsubscription(indexed uint256,indexed address)',
          handler: 'handleUnsubscription',
        },
        {
          event: 'Transfer(indexed address,indexed address,indexed uint256)',
          handler: 'handleTransfer',
        },
      ],
    },
  },
  EulerSwapFactory: {
    kind: 'ethereum/contract',
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.7',
      language: 'wasm/assemblyscript',
      file: './src/mappings/index.ts',
      entities: ['Position'],
      abis: [{ name: 'EulerSwapFactory', file: './abis/EulerSwapFactory.json' }],
      eventHandlers: [
        {
          event: 'PoolDeployed(indexed address,indexed address,indexed address,address)',
          handler: 'handleHookDeployed',
        },
        {
          event: 'PoolUninstalled(indexed address,indexed address,indexed address,address)',
          handler: 'handleHookUninstalled',
        },
      ],
    },
  },
  ArrakisHookFactory: {
    kind: 'ethereum/contract',
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.7',
      language: 'wasm/assemblyscript',
      file: './src/mappings/index.ts',
      entities: ['ArrakisHook'],
      abis: [{ name: 'ArrakisHookFactory', file: './abis/ArrakisHookFactory.json' }],
      eventHandlers: [
        {
          event: 'LogCreatePrivateHook(indexed address,indexed address,bytes32)',
          handler: 'handleHookDeployed',
        },
      ],
    },
  },
}

// Base subgraph configuration
const baseConfig = {
  specVersion: '0.0.4',
  description: 'Uniswap is a decentralized protocol for automated token exchange on Ethereum.',
  repository: 'https://github.com/Uniswap/v4-subgraph',
  schema: {
    file: './schema.graphql',
  },
  features: ['nonFatalErrors', 'grafting'],
}

function generateSubgraphConfig(network: string, networkConfig: NetworkConfig): any {
  const config = { ...baseConfig }
  const dataSources: any[] = []

  // For each contract in the network
  Object.entries(networkConfig).forEach(([contractName, contractConfig]) => {
    if (contractTemplates[contractName]) {
      const dataSource = {
        ...contractTemplates[contractName],
        name: contractName,
        network,
        source: {
          abi: contractName,
          address: contractConfig.address,
          startBlock: contractConfig.startBlock,
        },
      }
      dataSources.push(dataSource)
    }
  })

  return {
    ...config,
    dataSources,
  }
}

function main() {
  try {
    // Get network from command line arguments
    const network = process.argv[2]
    if (!network) {
      console.error('Please provide a network name as an argument')
      console.error('Usage: yarn generate-subgraph <network>')
      process.exit(1)
    }

    // Read networks.json
    const networksConfigPath = path.join(__dirname, '..', 'networks.json')
    const networksConfig: NetworksConfig = JSON.parse(fs.readFileSync(networksConfigPath, 'utf8'))

    // Check if network exists
    if (!networksConfig[network]) {
      console.error(`Network "${network}" not found in networks.json`)
      console.error('Available networks:', Object.keys(networksConfig).join(', '))
      process.exit(1)
    }

    // Generate the subgraph configuration for the specific network
    const subgraphConfig = generateSubgraphConfig(network, networksConfig[network])

    // Convert to YAML
    const yamlContent = yaml.stringify(subgraphConfig)

    // Write to subgraph.yaml
    const subgraphYamlPath = path.join(__dirname, '..', 'subgraph.yaml')
    fs.writeFileSync(subgraphYamlPath, yamlContent, 'utf8')

    console.log(`Successfully generated subgraph.yaml for network: ${network}`)
  } catch (error) {
    console.error('Error generating subgraph.yaml:', error)
    process.exit(1)
  }
}

main()
