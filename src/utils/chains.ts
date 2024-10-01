import { Address, BigDecimal, dataSource } from '@graphprotocol/graph-ts'

import { StaticTokenDefinition } from './staticTokenDefinition'

export enum ChainId {
  SEPOLIA = 11155111,
}

// assemblyscript does not support string enums, hence these constants
const SEPOLIA_NETWORK_NAME = 'sepolia'

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

  // token overrides are used to override RPC calls for the symbol, name, and
  // decimals for tokens. for new chains this is typically empty.
  tokenOverrides: StaticTokenDefinition[]

  // skip the creation of these pools in handlePoolCreated. for new chains this is typically empty.
  poolsToSkip: string[]

  // initialize this list of pools and token addresses on factory creation. for new chains this is typically empty.
  poolMappings: Array<Address[]>
}

export function getSubgraphConfig(): SubgraphConfig {
  // Update this value to the corresponding chain you want to deploy
  const selectedNetwork = dataSource.network()

  if (selectedNetwork == SEPOLIA_NETWORK_NAME) {
    return {
      poolManagerAddress: '0xE8E23e97Fa135823143d6b9Cba9c699040D51F70',
      stablecoinWrappedNativePoolId: '0x73156e5b34664a328d308c4de3a1ee9a33b99ebb516f99bef5095f41102e0e69',
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0xd0df82de051244f04bff3a8bb1f62e1cd39eed92', // WETH
      minimumNativeLocked: BigDecimal.fromString('20'),
      stablecoinAddresses: [
        '0xb60af4d222c522db7a2036a8b25a8d8c43c9da47', // USDC
      ],
      whitelistTokens: [
        '0xd0df82de051244f04bff3a8bb1f62e1cd39eed92', // WETH
        '0xb60af4d222c522db7a2036a8b25a8d8c43c9da47', // USDC
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
    }
  } else {
    throw new Error('Unsupported Network')
  }
}
