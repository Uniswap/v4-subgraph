import { Address, BigDecimal, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { assert, beforeEach, clearStore, describe, test } from 'matchstick-as'

import { handleInitializeHelper } from '../../src/mappings/poolManager'
import { Initialize } from '../../src/types/PoolManager/PoolManager'
import { Bundle, Pool, Token } from '../../src/types/schema'
import { SubgraphConfig } from '../../src/utils/chains'
import { ADDRESS_ZERO } from '../../src/utils/constants'
import { safeDiv } from '../../src/utils/index'
import { findNativePerToken, getNativePriceInUSD, sqrtPriceX96ToTokenPrices } from '../../src/utils/pricing'
import {
  assertObjectMatches,
  createAndStoreTestPool,
  createAndStoreTestToken,
  MOCK_EVENT,
  NATIVE_TOKEN_FIXTURE,
  PoolFixture,
  TEST_CONFIG,
  TEST_ETH_PRICE_USD,
  TokenFixture,
  USDC_MAINNET_FIXTURE,
  USDC_WETH_05_MAINNET_POOL_FIXTURE,
  USDC_WETH_POOL_ID,
  WBTC_MAINNET_FIXTURE,
  WBTC_WETH_03_MAINNET_POOL_FIXTURE,
  WBTC_WETH_POOL_ID,
  WETH_MAINNET_FIXTURE,
} from './constants'

class InitializeFixture {
  id: string
  currency0: string
  currency1: string
  fee: string
  tickSpacing: string
  hooks: string
  sqrtPriceX96: string
  tick: string
}

const INITIALIZE_FIXTURE: InitializeFixture = {
  id: USDC_WETH_POOL_ID,
  currency0: USDC_MAINNET_FIXTURE.address,
  currency1: WETH_MAINNET_FIXTURE.address,
  fee: '500',
  tickSpacing: '10',
  hooks: ADDRESS_ZERO,
  sqrtPriceX96: '1',
  tick: '1',
}

const id = Bytes.fromHexString(USDC_WETH_POOL_ID) as Bytes

const INITIALIZE_EVENT = new Initialize(
  MOCK_EVENT.address,
  MOCK_EVENT.logIndex,
  MOCK_EVENT.transactionLogIndex,
  MOCK_EVENT.logType,
  MOCK_EVENT.block,
  MOCK_EVENT.transaction,
  [
    new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(id)),
    new ethereum.EventParam('currency0', ethereum.Value.fromAddress(Address.fromString(INITIALIZE_FIXTURE.currency0))),
    new ethereum.EventParam('currency1', ethereum.Value.fromAddress(Address.fromString(INITIALIZE_FIXTURE.currency1))),
    new ethereum.EventParam('fee', ethereum.Value.fromI32(parseInt(INITIALIZE_FIXTURE.fee) as i32)),
    new ethereum.EventParam('tickSpacing', ethereum.Value.fromI32(parseInt(INITIALIZE_FIXTURE.tickSpacing) as i32)),
    new ethereum.EventParam('hooks', ethereum.Value.fromAddress(Address.fromString(INITIALIZE_FIXTURE.hooks))),
    new ethereum.EventParam(
      'sqrtPriceX96',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString(INITIALIZE_FIXTURE.sqrtPriceX96)),
    ),
    new ethereum.EventParam('tick', ethereum.Value.fromI32(parseInt(INITIALIZE_FIXTURE.tick) as i32)),
  ],
  MOCK_EVENT.receipt,
)

const FLETH_ADDRESS = '0x000000000bb1f9944965c64066d10038a84f9af2'
const FLETH_HOOK_ADDRESS = '0x1ba56371505975eb65bd0789bb78a977b126e888'
const ETH_FLETH_POOL_ID = '0xb748d39df6cb2fa7d10acd13c7db1b739c670782f1935f62da982fb877aee658'
const FLETH_WBTC_POOL_ID = '0x1111111111111111111111111111111111111111111111111111111111111111'

const FLETH_FIXTURE: TokenFixture = {
  address: FLETH_ADDRESS,
  symbol: 'flETH',
  name: 'flETH',
  totalSupply: '1000',
  decimals: '18',
  balanceOf: '1000',
}

const ETH_FLETH_POOL_FIXTURE: PoolFixture = {
  id: ETH_FLETH_POOL_ID,
  token0: NATIVE_TOKEN_FIXTURE,
  token1: FLETH_FIXTURE,
  feeTier: '0',
  tickSpacing: '60',
  liquidity: '0',
  hooks: FLETH_HOOK_ADDRESS,
  sqrtPrice: '79228162514264337593543950336',
  tick: '0',
}

const FLETH_WBTC_POOL_FIXTURE: PoolFixture = {
  id: FLETH_WBTC_POOL_ID,
  token0: FLETH_FIXTURE,
  token1: WBTC_MAINNET_FIXTURE,
  feeTier: '3000',
  tickSpacing: '60',
  liquidity: '100',
  hooks: ADDRESS_ZERO,
  sqrtPrice: '1',
  tick: '1',
}

const buildFlethTestConfig = (nativePeggedTokens: string[]): SubgraphConfig => {
  return {
    poolManagerAddress: TEST_CONFIG.poolManagerAddress,
    stablecoinWrappedNativePoolId: TEST_CONFIG.stablecoinWrappedNativePoolId,
    stablecoinIsToken0: TEST_CONFIG.stablecoinIsToken0,
    wrappedNativeAddress: TEST_CONFIG.wrappedNativeAddress,
    minimumNativeLocked: TEST_CONFIG.minimumNativeLocked,
    stablecoinAddresses: TEST_CONFIG.stablecoinAddresses,
    whitelistTokens: [ADDRESS_ZERO, FLETH_ADDRESS],
    tokenOverrides: [],
    poolsToSkip: [],
    poolMappings: [],
    nativePeggedTokens,
    nativeTokenDetails: TEST_CONFIG.nativeTokenDetails,
  }
}

const buildEthFlethInitializeEvent = (): Initialize => {
  return new Initialize(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(Bytes.fromHexString(ETH_FLETH_POOL_ID) as Bytes)),
      new ethereum.EventParam('currency0', ethereum.Value.fromAddress(Address.fromString(ADDRESS_ZERO))),
      new ethereum.EventParam('currency1', ethereum.Value.fromAddress(Address.fromString(FLETH_ADDRESS))),
      new ethereum.EventParam('fee', ethereum.Value.fromI32(0)),
      new ethereum.EventParam('tickSpacing', ethereum.Value.fromI32(60)),
      new ethereum.EventParam('hooks', ethereum.Value.fromAddress(Address.fromString(FLETH_HOOK_ADDRESS))),
      new ethereum.EventParam(
        'sqrtPriceX96',
        ethereum.Value.fromUnsignedBigInt(BigInt.fromString(ETH_FLETH_POOL_FIXTURE.sqrtPrice)),
      ),
      new ethereum.EventParam('tick', ethereum.Value.fromI32(0)),
    ],
    MOCK_EVENT.receipt,
  )
}

describe('handleInitialize', () => {
  test('success', () => {
    createAndStoreTestPool(USDC_WETH_05_MAINNET_POOL_FIXTURE)

    const token0 = createAndStoreTestToken(USDC_MAINNET_FIXTURE)
    const token1 = createAndStoreTestToken(WETH_MAINNET_FIXTURE)

    const bundle = new Bundle('1')
    bundle.ethPriceUSD = TEST_ETH_PRICE_USD
    bundle.save()

    handleInitializeHelper(INITIALIZE_EVENT, TEST_CONFIG)
    const expectedPrices = sqrtPriceX96ToTokenPrices(
      BigInt.fromString(INITIALIZE_FIXTURE.sqrtPriceX96),
      token0,
      token1,
      TEST_CONFIG.nativeTokenDetails,
    )

    assertObjectMatches('Pool', USDC_WETH_POOL_ID, [
      ['token0', token0.id],
      ['token1', token1.id],
      ['feeTier', INITIALIZE_FIXTURE.fee],
      ['tickSpacing', INITIALIZE_FIXTURE.tickSpacing],
      ['hooks', INITIALIZE_FIXTURE.hooks],
      ['sqrtPrice', INITIALIZE_FIXTURE.sqrtPriceX96],
      ['tick', INITIALIZE_FIXTURE.tick],
      ['createdAtTimestamp', MOCK_EVENT.block.timestamp.toString()],
      ['createdAtBlockNumber', MOCK_EVENT.block.number.toString()],
      ['token0Price', expectedPrices[0].toString()],
      ['token1Price', expectedPrices[1].toString()],
    ])

    const expectedEthPrice = getNativePriceInUSD(USDC_WETH_POOL_ID, true)
    assertObjectMatches('Bundle', '1', [['ethPriceUSD', expectedEthPrice.toString()]])

    const expectedToken0Price = findNativePerToken(
      token0,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
    )
    assertObjectMatches('Token', USDC_MAINNET_FIXTURE.address, [['derivedETH', expectedToken0Price.toString()]])

    const expectedToken1Price = findNativePerToken(
      token1,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
    )
    assertObjectMatches('Token', WETH_MAINNET_FIXTURE.address, [['derivedETH', expectedToken1Price.toString()]])
  })
})

describe('handleInitialize - native-pegged token', () => {
  beforeEach(() => {
    clearStore()

    createAndStoreTestToken(NATIVE_TOKEN_FIXTURE)
    createAndStoreTestToken(FLETH_FIXTURE)

    const bundle = new Bundle('1')
    bundle.ethPriceUSD = TEST_ETH_PRICE_USD
    bundle.save()
  })

  test('success - flETH is priced 1:1 with ETH from a zero-liquidity ETH/flETH pool', () => {
    handleInitializeHelper(buildEthFlethInitializeEvent(), buildFlethTestConfig([FLETH_ADDRESS]))

    assertObjectMatches('Pool', ETH_FLETH_POOL_ID, [
      ['liquidity', '0'],
      ['hooks', FLETH_HOOK_ADDRESS],
    ])
    assertObjectMatches('Token', FLETH_ADDRESS, [['derivedETH', '1']])
    assertObjectMatches('Token', ADDRESS_ZERO, [['derivedETH', '1']])

    const fleth = Token.load(FLETH_ADDRESS)!
    assert.assertTrue(fleth.whitelistPools.includes(ETH_FLETH_POOL_ID))
    const eth = Token.load(ADDRESS_ZERO)!
    assert.assertTrue(eth.whitelistPools.includes(ETH_FLETH_POOL_ID))
  })

  test('failure - flETH stays unpriced when it is not configured as native-pegged', () => {
    handleInitializeHelper(buildEthFlethInitializeEvent(), buildFlethTestConfig([]))

    assertObjectMatches('Token', FLETH_ADDRESS, [['derivedETH', '0']])
  })
})

describe('getEthPriceInUSD', () => {
  beforeEach(() => {
    clearStore()
    createAndStoreTestPool(USDC_WETH_05_MAINNET_POOL_FIXTURE)
  })

  test('success - stablecoin is token0', () => {
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.token0Price = BigDecimal.fromString('1')
    pool.save()

    const ethPriceUSD = getNativePriceInUSD(USDC_WETH_POOL_ID, true)

    assert.assertTrue(ethPriceUSD == BigDecimal.fromString('1'))
  })

  test('success - stablecoin is token1', () => {
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.token1Price = BigDecimal.fromString('1')
    pool.save()

    const ethPriceUSD = getNativePriceInUSD(USDC_WETH_POOL_ID, false)

    assert.assertTrue(ethPriceUSD == BigDecimal.fromString('1'))
  })

  test('failure - pool not found', () => {
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.token0Price = BigDecimal.fromString('1')
    pool.token1Price = BigDecimal.fromString('1')
    pool.save()

    const ethPriceUSD = getNativePriceInUSD(ADDRESS_ZERO, true)
    assert.assertTrue(ethPriceUSD == BigDecimal.fromString('0'))
  })
})

describe('findNativePerToken', () => {
  beforeEach(() => {
    clearStore()

    const bundle = new Bundle('1')
    bundle.ethPriceUSD = TEST_ETH_PRICE_USD
    bundle.save()
  })

  test('success - token is wrapped native', () => {
    const token = createAndStoreTestToken(WETH_MAINNET_FIXTURE)
    const ethPerToken = findNativePerToken(
      token,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
    )
    assert.assertTrue(ethPerToken == BigDecimal.fromString('1'))
  })

  test('success - token is native', () => {
    const token = createAndStoreTestToken(NATIVE_TOKEN_FIXTURE)
    const ethPerToken = findNativePerToken(
      token,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
    )
    assert.assertTrue(ethPerToken == BigDecimal.fromString('1'))
  })

  test('success - token is stablecoin', () => {
    const token = createAndStoreTestToken(USDC_MAINNET_FIXTURE)
    const ethPerToken = findNativePerToken(
      token,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
    )
    const expectedStablecoinPrice = safeDiv(BigDecimal.fromString('1'), TEST_ETH_PRICE_USD)
    assert.assertTrue(ethPerToken == expectedStablecoinPrice)
  })

  test('success - token is not wrapped native or stablecoin', () => {
    const pool = createAndStoreTestPool(WBTC_WETH_03_MAINNET_POOL_FIXTURE)

    const minimumEthLocked = BigDecimal.fromString('0')

    pool.liquidity = BigInt.fromString('100')
    pool.totalValueLockedToken1 = BigDecimal.fromString('100')
    pool.token1Price = BigDecimal.fromString('5')
    pool.save()

    const token0 = createAndStoreTestToken(WBTC_MAINNET_FIXTURE)
    token0.whitelistPools = [WBTC_WETH_POOL_ID]
    token0.save()

    const token1 = createAndStoreTestToken(WETH_MAINNET_FIXTURE)
    token1.derivedETH = BigDecimal.fromString('10')
    token1.save()

    const ethPerToken = findNativePerToken(
      token0,
      WETH_MAINNET_FIXTURE.address,
      [USDC_MAINNET_FIXTURE.address],
      minimumEthLocked,
    )

    assert.assertTrue(ethPerToken == BigDecimal.fromString('50'))
  })

  test('success - token is not wrapped native or stablecoin, but has no pools', () => {
    const token0 = createAndStoreTestToken(WBTC_MAINNET_FIXTURE)
    const ethPerToken = findNativePerToken(
      token0,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
    )
    assert.assertTrue(ethPerToken == BigDecimal.fromString('0'))
  })

  test('success - token is not wrapped native or stablecoin, but has no pools with liquidity', () => {
    const token0 = createAndStoreTestToken(WBTC_MAINNET_FIXTURE)
    token0.whitelistPools = [WBTC_WETH_POOL_ID]
    token0.save()

    const ethPerToken = findNativePerToken(
      token0,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
    )
    assert.assertTrue(ethPerToken == BigDecimal.fromString('0'))
  })

  test('success - token is native-pegged', () => {
    const ethFlethPool = createAndStoreTestPool(ETH_FLETH_POOL_FIXTURE)
    ethFlethPool.totalValueLockedToken0 = BigDecimal.fromString('0')
    ethFlethPool.save()

    const fleth = createAndStoreTestToken(FLETH_FIXTURE)
    fleth.whitelistPools = [ETH_FLETH_POOL_ID]
    fleth.save()

    const ethPerToken = findNativePerToken(
      fleth,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      BigDecimal.fromString('1'),
      [FLETH_ADDRESS],
    )
    assert.assertTrue(ethPerToken == BigDecimal.fromString('1'))
  })

  test('failure - native-pegged token not in the configured list has no price', () => {
    const fleth = createAndStoreTestToken(FLETH_FIXTURE)
    const ethPerToken = findNativePerToken(
      fleth,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      BigDecimal.fromString('1'),
      [],
    )
    assert.assertTrue(ethPerToken == BigDecimal.fromString('0'))
  })

  test('success - token paired with a native-pegged whitelist token is priced through it', () => {
    const pool = createAndStoreTestPool(FLETH_WBTC_POOL_FIXTURE)
    pool.liquidity = BigInt.fromString('100')
    pool.totalValueLockedToken0 = BigDecimal.fromString('10')
    pool.token0Price = BigDecimal.fromString('20')
    pool.save()

    const fleth = createAndStoreTestToken(FLETH_FIXTURE)
    fleth.derivedETH = BigDecimal.fromString('1')
    fleth.save()

    const wbtc = createAndStoreTestToken(WBTC_MAINNET_FIXTURE)
    wbtc.whitelistPools = [FLETH_WBTC_POOL_ID]
    wbtc.save()

    const ethPerToken = findNativePerToken(
      wbtc,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      BigDecimal.fromString('1'),
      [FLETH_ADDRESS],
    )
    assert.assertTrue(ethPerToken == BigDecimal.fromString('20'))
  })

  test('failure - native-pegged side below minimumNativeLocked leaves the paired token unpriced', () => {
    const pool = createAndStoreTestPool(FLETH_WBTC_POOL_FIXTURE)
    pool.liquidity = BigInt.fromString('100')
    pool.totalValueLockedToken0 = BigDecimal.fromString('0.05')
    pool.token0Price = BigDecimal.fromString('20')
    pool.save()

    const fleth = createAndStoreTestToken(FLETH_FIXTURE)
    fleth.derivedETH = BigDecimal.fromString('1')
    fleth.save()

    const wbtc = createAndStoreTestToken(WBTC_MAINNET_FIXTURE)
    wbtc.whitelistPools = [FLETH_WBTC_POOL_ID]
    wbtc.save()

    const ethPerToken = findNativePerToken(
      wbtc,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      BigDecimal.fromString('1'),
      [FLETH_ADDRESS],
    )
    assert.assertTrue(ethPerToken == BigDecimal.fromString('0'))
  })
})
