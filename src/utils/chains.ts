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
      kittycornBankAddress: '0x9e09Ea7d3AaDEDA139c69F5b06aBA5546705a56E',
      kittycornPositionManagerAddress: '0x9217f722bcd5812FA14538BFDc5f2c4D0546594e',
    }
  } else if (selectedNetwork == SEPOLIA_DEV_NETWORK_NAME) {
    return {
      poolManagerAddress: '0xEa62dEb48b86E4561e95Aa2457295C3F1E4CF102',
      stablecoinWrappedNativePoolId: '0xb2cc60d9c71e558566ae21f52260ab60a8605b57459065c33f8bf3ea62a78fef', // ETH-USDC 0.05% on UniswapPositionManager(0x0372dd045edF01740D18d325AeCb2Dcb4913Cd29)
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
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
      kittycornBankAddress: '0x27943ae3050AAcC334F54a7ff782C4c3423e6931',
      kittycornPositionManagerAddress: '0xc6Ae26187795D15Ef8Ee508c1cD058AE3150de53',
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
      kittycornBankAddress: '0xc78C603644b59CCbC869fa36B72adE24C9e04C40',
      kittycornPositionManagerAddress: '0x0',
    }
  } else {
    throw new Error('Unsupported Network')
  }
}
