import { Address, BigDecimal, BigInt, dataSource } from '@graphprotocol/graph-ts'

import { NativeTokenDetails } from './nativeTokenDetails'
import { StaticTokenDefinition } from './staticTokenDefinition'

export enum ChainId {
  SEPOLIA = 11155111,
}

// assemblyscript does not support string enums, hence these constants
const SEPOLIA_NETWORK_NAME = 'sepolia'
const SEPOLIA_DEV_NETWORK_NAME = 'sepolia-dev'
const BSC_NETWORK_NAME = 'bsc'
const MAINNET_NETWORK_NAME = 'mainnet'
const MAINNET_FORK_NETWORK_NAME = 'mainnet-fork'
const ARBITRUM_ONE_NETWORK_NAME = 'arbitrum-one'
// Note: All token and pool addresses should be lowercased!
export class SubgraphConfig {
  // deployment address
  poolManagerAddress: string

  // the address of a pool where one token is a stablecoin and the other is a
  // token that tracks the price of the native token use this to calculate the
  // price of the native token, so prefer a pool with highest liquidity
  stablecoinWrappedNativePoolId: string

  // true is stablecoin is token0, false if stablecoin is token1
  stablecoinIsToken0: boolean

  // the address of a token that tracks the price of the native token, most of
  // the time, this is a wrapped asset but could also be the native token itself
  // for some chains
  wrappedNativeAddress: string

  // the mimimum liquidity in a pool needed for it to be used to help calculate
  // token prices. for new chains, this should be initialized to ~4000 USD
  minimumNativeLocked: BigDecimal

  // list of stablecoin addresses
  stablecoinAddresses: string[]

  // a token must be in a pool with one of these tokens in order to derive a
  // price (in addition to passing the minimumEthLocked check). This is also
  // used to determine whether volume is tracked or not.
  whitelistTokens: string[]

  tokenizes: Array<string[]>

  // token overrides are used to override RPC calls for the symbol, name, and
  // decimals for tokens. for new chains this is typically empty.
  tokenOverrides: StaticTokenDefinition[]

  // skip the creation of these pools in handlePoolCreated. for new chains this is typically empty.
  poolsToSkip: string[]

  // initialize this list of pools and token addresses on factory creation. for new chains this is typically empty.
  poolMappings: Array<Address[]>

  // native token details for the chain.
  nativeTokenDetails: NativeTokenDetails

  // address of the kittycorn bank contract
  kittycornBankAddress: string

  // address of the kittycorn position manager contract
  kittycornPositionManagerAddress: string

  // address of the kittycorn migrator contract
  kittycornMigratorAddress: string
}

export function getSubgraphConfig(): SubgraphConfig {
  // Update this value to the corresponding chain you want to deploy
  const selectedNetwork = dataSource.network()

  if (selectedNetwork == SEPOLIA_NETWORK_NAME) {
    return {
      poolManagerAddress: '0xe03a1074c86cfedd5c142c4f04f1a1536e203543',
      stablecoinWrappedNativePoolId: '0x0348712fe03e7976482c0af1264a380df79c5ea3f49ab0b045f8b94e543e804c',
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', // WETH
      minimumNativeLocked: BigDecimal.fromString('0'),
      stablecoinAddresses: [
        '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', // USDC
        '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', // USDT
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', // USDC
        '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', // USDT,
        '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', // WETH
        '0x1289c2dc45a0ea5e67f6ffa2b601d23d66547d3e', // tAAVE
        '0x67332e6e2fbb793b822f3c2d7ff8be9f07f1ead9', // tWBTC
        '0x54f4d76dab01190a32fb0a5da441be85e3cef937', // tWETH
        '0x7dde6bd33b4e6eb1d6f0519f4cf65deeb162dd86', // tLINK
        '0x1e271db8d8b446a0dee8e9d774f4213e9bc1c6ba', // tUSDC
        '0x137a906e06ec20808c8f156f9024196427429220', // tUSDT
      ],
      tokenizes: [
        ['0x1289c2dc45a0ea5e67f6ffa2b601d23d66547d3e', '0x88541670e55cc00beefd87eb59edd1b7c511ac9a'], // tAAVE
        ['0x67332e6e2fbb793b822f3c2d7ff8be9f07f1ead9', '0x29f2d40b0605204364af54ec677bd022da425d03'], // tWBTC
        ['0x54f4d76dab01190a32fb0a5da441be85e3cef937', '0xc558dbdd856501fcd9aaf1e62eae57a9f0629a3c'], // tWETH
        ['0x7dde6bd33b4e6eb1d6f0519f4cf65deeb162dd86', '0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5'], // tLINK
        ['0x1e271db8d8b446a0dee8e9d774f4213e9bc1c6ba', '0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8'], // tUSDC
        ['0x137a906e06ec20808c8f156f9024196427429220', '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0'], // tUSDT
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
      kittycornBankAddress: '0x9e09ea7d3aadeda139c69f5b06aba5546705a56e',
      kittycornPositionManagerAddress: '0x9217f722bcd5812fa14538bfdc5f2c4d0546594e',
      kittycornMigratorAddress: '0x0000000000000000000000000000000000000000',
    }
  } else if (selectedNetwork == SEPOLIA_DEV_NETWORK_NAME) {
    return {
      poolManagerAddress: '0xea62deb48b86e4561e95aa2457295c3f1e4cf102',
      stablecoinWrappedNativePoolId: '0x06bf19febfc37a95cae4f798ce744cf052fe7b96d4bdb55ad31335492cc5eb4b', // WETH-USDT 0.3% on UniswapPositionManager(0x0372dd045edF01740D18d325AeCb2Dcb4913Cd29)
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0xc558dbdd856501fcd9aaf1e62eae57a9f0629a3c', // WETH
      minimumNativeLocked: BigDecimal.fromString('0'),
      stablecoinAddresses: [
        '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', // USDC
        '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', // USDT
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', // USDC
        '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', // USDT,
        '0xc558dbdd856501fcd9aaf1e62eae57a9f0629a3c', // WETH,
        '0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5', // LINK,
        '0x29f2d40b0605204364af54ec677bd022da425d03', // WBTC **
        '0x88541670e55cc00beefd87eb59edd1b7c511ac9a', // AAVE **
        '0x23dce411895b4ca1bc7a50daf5747e87e7f69bd0', // tAAVE
        '0x51e8c058a1114af07e33758b34d875c91d671b49', // tWBTC
        '0x4e2cc7950eea2d4e35fa09b02d58f59f2aeae8bb', // tWETH
        '0x1e271db8d8b446a0dee8e9d774f4213e9bc1c6ba', // tLINK
        '0x1e271db8d8b446a0dee8e9d774f4213e9bc1c6ba', // tUSDC
        '0x137a906e06ec20808c8f156f9024196427429220', // tUSDT
      ],
      tokenizes: [
        ['0x23dce411895b4ca1bc7a50daf5747e87e7f69bd0', '0x88541670e55cc00beefd87eb59edd1b7c511ac9a'], // tAAVE
        ['0x51e8c058a1114af07e33758b34d875c91d671b49', '0x29f2d40b0605204364af54ec677bd022da425d03'], // tWBTC
        ['0x4e2cc7950eea2d4e35fa09b02d58f59f2aeae8bb', '0xc558dbdd856501fcd9aaf1e62eae57a9f0629a3c'], // tWETH
        ['0x0e9014c2b4f586253881858a9a9c5a273c16f5c5', '0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5'], // tLINK
        ['0x1e271db8d8b446a0dee8e9d774f4213e9bc1c6ba', '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238'], // tUSDC
        ['0x137a906e06ec20808c8f156f9024196427429220', '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0'], // tUSDT
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
      kittycornBankAddress: '0xdcb95eb81869c75aa00cd320a538212a3c6be38a',
      kittycornPositionManagerAddress: '0xfe8e8f0a1305a0f66f4deb744f94726be489602c',
      kittycornMigratorAddress: '0x0000000000000000000000000000000000000000',
    }
  } else if (selectedNetwork == BSC_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df',
      stablecoinWrappedNativePoolId: '0x4c9dff5169d88f7fbf5e43fc8e2eb56bf9791785729b9fc8c22064a47af12052', // https://bscscan.com/tx/0x36c1e4c7b4105a0be337addc32b5564dd3494fccfe331bf9fe7c647163d27d05#eventlog
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB
      minimumNativeLocked: BigDecimal.fromString('10'),
      stablecoinAddresses: [
        '0x55d398326f99059ff775485246999027b3197955', // USDT
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
      ],
      whitelistTokens: [
        '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB
        '0x55d398326f99059ff775485246999027b3197955', // USDT
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
        '0x0000000000000000000000000000000000000000', // Native BNB
      ],
      tokenizes: [],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'BNB',
        name: 'Binance Coin',
        decimals: BigInt.fromI32(18),
      },
      kittycornBankAddress: '0x0',
      kittycornPositionManagerAddress: '0x0',
      kittycornMigratorAddress: '0x0000000000000000000000000000000000000000',
    }
  } else if (selectedNetwork == MAINNET_NETWORK_NAME || selectedNetwork == MAINNET_FORK_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x000000000004444c5dc75cb358380d2e3de08a90',
      stablecoinWrappedNativePoolId: '0x4f88f7c99022eace4740c6898f59ce6a2e798a1e64ce54589720b7153eb224a7', // https://etherscan.io/tx/0x4e63fcc0dd42a2b317e77d17e236cadf77464a08ccece33a354bd8648b5f7419#eventlog
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
        '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
        '0x0000000000085d4780b73119b644ae5ecd22b376', // TUSD
        '0x956f47f50a910163d8bf957cf5846d573e7f87ca', // FEI
      ],
      whitelistTokens: [
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
        '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
        '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
        '0x0000000000085d4780b73119b644ae5ecd22b376', // TUSD
        '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
        '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643', // cDAI
        '0x39aa39c021dfbae8fac545936693ac917d5e7563', // cUSDC
        '0x86fadb80d8d2cff3c3680819e4da99c10232ba0f', // EBASE
        '0x57ab1ec28d129707052df4df418d58a2d46d5f51', // sUSD
        '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', // MKR
        '0xc00e94cb662c3520282e6f5717214004a7f26888', // COMP
        '0x514910771af9ca656af840dff83e8264ecf986ca', // LINK
        '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', // SNX
        '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e', // YFI
        '0x111111111117dc0aa78b770fa6a738034120c302', // 1INCH
        '0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8', // yCurv
        '0x956f47f50a910163d8bf957cf5846d573e7f87ca', // FEI
        '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', // MATIC
        '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', // AAVE
        '0xfe2e637202056d30016725477c5da089ab0a043a', // sETH2
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenizes: [],
      tokenOverrides: [
        {
          address: Address.fromString('0xe0b7927c4af23765cb51314a0e0521a9645f0e2a'),
          symbol: 'DGD',
          name: 'DGD',
          decimals: BigInt.fromI32(9),
        },
        {
          address: Address.fromString('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'),
          symbol: 'AAVE',
          name: 'Aave Token',
          decimals: BigInt.fromI32(18),
        },
        {
          address: Address.fromString('0xeb9951021698b42e4399f9cbb6267aa35f82d59d'),
          symbol: 'LIF',
          name: 'Lif',
          decimals: BigInt.fromI32(18),
        },
        {
          address: Address.fromString('0xbdeb4b83251fb146687fa19d1c660f99411eefe3'),
          symbol: 'SVD',
          name: 'savedroid',
          decimals: BigInt.fromI32(18),
        },
        {
          address: Address.fromString('0xbb9bc244d798123fde783fcc1c72d3bb8c189413'),
          symbol: 'TheDAO',
          name: 'TheDAO',
          decimals: BigInt.fromI32(16),
        },
        {
          address: Address.fromString('0x38c6a68304cdefb9bec48bbfaaba5c5b47818bb2'),
          symbol: 'HPB',
          name: 'HPBCoin',
          decimals: BigInt.fromI32(18),
        },
      ],
      poolMappings: [],
      poolsToSkip: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
      kittycornBankAddress: '0xc78c603644b59ccbc869fa36b72ade24c9e04c40',
      kittycornPositionManagerAddress: '0x0',
      kittycornMigratorAddress: '0x0000000000000000000000000000000000000000',
    }
  } else if (selectedNetwork == ARBITRUM_ONE_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
      stablecoinWrappedNativePoolId: '0xfc7b3ad139daaf1e9c3637ed921c154d1b04286f8a82b805a6c352da57028653', // <- WETH-USDC 0.05% https://app.uniswap.org/explore/pools/arbitrum/0xfc7b3ad139daaf1e9c3637ed921c154d1b04286f8a82b805a6c352da57028653
      stablecoinIsToken0: false,
      wrappedNativeAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT,
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
        '0xba5ddd1f9d7f570dc94a51479a000e3bce967196', // AAVE
        '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', // WBTC
        '0xf97f4df75117a78c1a5a0dbb814af92458539fb4', // LINK
        '0x3ed9d2e07d314f2dca05f920ed5cbf2dff60bc9a', // tAAVE
        '0x8fecd0452bbf493c4915834e75310a5e8fe1fdde', // tWBTC
        '0xcfdab139da7252ec3d8df14f03659a46d1d1848c', // tWETH
        '0xdd816723cf1b310d1755156c4f37b4c8ed54ed5c', // tLINK
        '0x43297fbd1306f9fcdf96ee3a27e0113e4295d738', // tUSDC
        '0x93ee5b16f4dde4566b94488b8d929f39df112f60', // tUSDT
      ],
      tokenizes: [
        ['0x3ed9d2e07d314f2dca05f920ed5cbf2dff60bc9a', '0xba5ddd1f9d7f570dc94a51479a000e3bce967196'], // tAAVE
        ['0x8fecd0452bbf493c4915834e75310a5e8fe1fdde', '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'], // tWBTC
        ['0xcfdab139da7252ec3d8df14f03659a46d1d1848c', '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'], // tWETH
        ['0xdd816723cf1b310d1755156c4f37b4c8ed54ed5c', '0xf97f4df75117a78c1a5a0dbb814af92458539fb4'], // tLINK
        ['0x43297fbd1306f9fcdf96ee3a27e0113e4295d738', '0xaf88d065e77c8cc2239327c5edb3a432268e5831'], // tUSDC
        ['0x93ee5b16f4dde4566b94488b8d929f39df112f60', '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'], // tUSDT
      ],
      tokenOverrides: [
        {
          address: Address.fromString('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'),
          symbol: 'WETH',
          name: 'Wrapped Ethereum',
          decimals: BigInt.fromI32(18),
        },
        {
          address: Address.fromString('0xff970a61a04b1ca14834a43f5de4533ebddb5cc8'),
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: BigInt.fromI32(6),
        },
      ],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
      kittycornBankAddress: '0xf0e778f51865b9c3bcbfe2b59ad19a12d6d1a0fc',
      kittycornPositionManagerAddress: '0x0989f4a52cc70099392b38e3d405e4f515d12630',
      kittycornMigratorAddress: '0xc78c603644b59ccbc869fa36b72ade24c9e04c40',
    }
  } else {
    throw new Error('Unsupported Network')
  }
}
