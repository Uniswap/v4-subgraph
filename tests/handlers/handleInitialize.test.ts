import { Address, BigDecimal, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { assert, beforeEach, clearStore, describe, test } from 'matchstick-as'

import { handleInitializeHelper } from '../../src/mappings/poolManager'
import { Initialize } from '../../src/types/PoolManager/PoolManager'
import { Bundle, Pool, Token } from '../../src/types/schema'
import { ADDRESS_ZERO } from '../../src/utils/constants'
import { safeDiv } from '../../src/utils/index'
import { findNativePerToken, getNativePriceInUSD, sqrtPriceX96ToTokenPrices } from '../../src/utils/pricing'
import {
  assertObjectMatches,
  createAndStoreTestPool,
  createAndStoreTestToken,
  MOCK_EVENT,
  NATIVE_TOKEN_FIXTURE,
  TEST_CONFIG,
  TEST_ETH_PRICE_USD,
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
})

describe('handleInitialize - Zora Content Token Logic', () => {
  // Zora content token test constants
  const ZORA_CREATOR_TOKEN_ADDRESS = '0x1234567890123456789012345678901234567890'
  const ZORA_CONTENT_TOKEN_ADDRESS = '0x0987654321098765432109876543210987654321'
  const ZORA_CONTENT_HOOK = '0x9ea932730a7787000042e34390b8e435dd839040'
  const ZORA_POOL_ID = '0x5555555555555555555555555555555555555555555555555555555555555555'

  beforeEach(() => {
    clearStore()

    const bundle = new Bundle('1')
    bundle.ethPriceUSD = TEST_ETH_PRICE_USD
    bundle.save()
  })

  test('content token gets whitelisted when Zora pool is initialized', () => {
    // Create creator token (has existing whitelist pools)
    const creatorToken = createAndStoreTestToken({
      address: ZORA_CREATOR_TOKEN_ADDRESS,
      symbol: 'CREATOR',
      name: 'Creator Token',
      totalSupply: '1000000',
      decimals: '18',
      balanceOf: '1000',
    })
    creatorToken.whitelistPools = [USDC_WETH_POOL_ID]
    creatorToken.save()

    // Create content token (no whitelist pools initially)
    const contentToken = createAndStoreTestToken({
      address: ZORA_CONTENT_TOKEN_ADDRESS,
      symbol: 'CONTENT',
      name: 'Content Token',
      totalSupply: '1000000',
      decimals: '18',
      balanceOf: '1000',
    })
    contentToken.whitelistPools = []
    contentToken.save()

    // Create initialize event for Zora content token pool
    const zoraInitializeEvent = new Initialize(
      MOCK_EVENT.address,
      MOCK_EVENT.logIndex,
      MOCK_EVENT.transactionLogIndex,
      MOCK_EVENT.logType,
      MOCK_EVENT.block,
      MOCK_EVENT.transaction,
      [
        new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(Bytes.fromHexString(ZORA_POOL_ID))),
        new ethereum.EventParam(
          'currency0',
          ethereum.Value.fromAddress(Address.fromString(ZORA_CONTENT_TOKEN_ADDRESS)),
        ),
        new ethereum.EventParam(
          'currency1',
          ethereum.Value.fromAddress(Address.fromString(ZORA_CREATOR_TOKEN_ADDRESS)),
        ),
        new ethereum.EventParam('fee', ethereum.Value.fromI32(500)),
        new ethereum.EventParam('tickSpacing', ethereum.Value.fromI32(10)),
        new ethereum.EventParam('hooks', ethereum.Value.fromAddress(Address.fromString(ZORA_CONTENT_HOOK))),
        new ethereum.EventParam(
          'sqrtPriceX96',
          ethereum.Value.fromUnsignedBigInt(BigInt.fromString('79228162514264337593543950336')),
        ),
        new ethereum.EventParam('tick', ethereum.Value.fromI32(0)),
      ],
      MOCK_EVENT.receipt,
    )

    // Before initialization: content token should have no whitelist pools
    const contentTokenBefore = Token.load(ZORA_CONTENT_TOKEN_ADDRESS)!
    assert.assertTrue(contentTokenBefore.whitelistPools.length == 0)

    // Execute initialization
    handleInitializeHelper(zoraInitializeEvent, TEST_CONFIG)

    // After initialization: content token should be whitelisted
    const contentTokenAfter = Token.load(ZORA_CONTENT_TOKEN_ADDRESS)!
    assert.assertTrue(contentTokenAfter.whitelistPools.length == 1)
    // Use array includes helper to work around string comparison issues
    assert.assertTrue(arrayIncludesString(contentTokenAfter.whitelistPools, ZORA_POOL_ID))

    // Creator token whitelist should remain unchanged
    const creatorTokenAfter = Token.load(ZORA_CREATOR_TOKEN_ADDRESS)!
    assert.assertTrue(creatorTokenAfter.whitelistPools.length == 1)
    assert.assertTrue(creatorTokenAfter.whitelistPools[0] == USDC_WETH_POOL_ID)
  })

  test('content token as token1 gets whitelisted when Zora pool is initialized', () => {
    // Test reverse scenario where content token is token1, creator is token0
    const CREATOR_TOKEN_1_ADDRESS = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const CONTENT_TOKEN_1_ADDRESS = '0xcccccccccccccccccccccccccccccccccccccccc'
    const ZORA_POOL_ID_1 = '0x6666666666666666666666666666666666666666666666666666666666666666'

    // Create creator token
    const creatorToken1 = createAndStoreTestToken({
      address: CREATOR_TOKEN_1_ADDRESS,
      symbol: 'CREATOR1',
      name: 'Creator Token 1',
      totalSupply: '1000000',
      decimals: '18',
      balanceOf: '1000',
    })
    creatorToken1.whitelistPools = [USDC_WETH_POOL_ID]
    creatorToken1.save()

    // Create content token
    const contentToken1 = createAndStoreTestToken({
      address: CONTENT_TOKEN_1_ADDRESS,
      symbol: 'CONTENT1',
      name: 'Content Token 1',
      totalSupply: '1000000',
      decimals: '18',
      balanceOf: '1000',
    })
    contentToken1.whitelistPools = []
    contentToken1.save()

    // Create initialize event with creator as token0, content as token1
    const zoraInitializeEvent1 = new Initialize(
      MOCK_EVENT.address,
      MOCK_EVENT.logIndex,
      MOCK_EVENT.transactionLogIndex,
      MOCK_EVENT.logType,
      MOCK_EVENT.block,
      MOCK_EVENT.transaction,
      [
        new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(Bytes.fromHexString(ZORA_POOL_ID_1))),
        new ethereum.EventParam('currency0', ethereum.Value.fromAddress(Address.fromString(CREATOR_TOKEN_1_ADDRESS))),
        new ethereum.EventParam('currency1', ethereum.Value.fromAddress(Address.fromString(CONTENT_TOKEN_1_ADDRESS))),
        new ethereum.EventParam('fee', ethereum.Value.fromI32(500)),
        new ethereum.EventParam('tickSpacing', ethereum.Value.fromI32(10)),
        new ethereum.EventParam('hooks', ethereum.Value.fromAddress(Address.fromString(ZORA_CONTENT_HOOK))),
        new ethereum.EventParam(
          'sqrtPriceX96',
          ethereum.Value.fromUnsignedBigInt(BigInt.fromString('79228162514264337593543950336')),
        ),
        new ethereum.EventParam('tick', ethereum.Value.fromI32(0)),
      ],
      MOCK_EVENT.receipt,
    )

    // Execute initialization
    handleInitializeHelper(zoraInitializeEvent1, TEST_CONFIG)

    // Content token (token1) should be whitelisted
    const contentToken1After = Token.load(CONTENT_TOKEN_1_ADDRESS)!
    assert.assertTrue(contentToken1After.whitelistPools.length == 1)
    assert.assertTrue(arrayIncludesString(contentToken1After.whitelistPools, ZORA_POOL_ID_1))
  })

  test('non-Zora pools do not affect content token whitelist during initialization', () => {
    // Create tokens
    const token0 = createAndStoreTestToken({
      address: ZORA_CONTENT_TOKEN_ADDRESS,
      symbol: 'CONTENT',
      name: 'Content Token',
      totalSupply: '1000000',
      decimals: '18',
      balanceOf: '1000',
    })
    token0.whitelistPools = []
    token0.save()

    const token1 = createAndStoreTestToken({
      address: ZORA_CREATOR_TOKEN_ADDRESS,
      symbol: 'CREATOR',
      name: 'Creator Token',
      totalSupply: '1000000',
      decimals: '18',
      balanceOf: '1000',
    })
    token1.whitelistPools = [USDC_WETH_POOL_ID]
    token1.save()

    // Create regular pool (no hook) with same tokens
    const REGULAR_POOL_ID = '0x7777777777777777777777777777777777777777777777777777777777777777'
    const regularInitializeEvent = new Initialize(
      MOCK_EVENT.address,
      MOCK_EVENT.logIndex,
      MOCK_EVENT.transactionLogIndex,
      MOCK_EVENT.logType,
      MOCK_EVENT.block,
      MOCK_EVENT.transaction,
      [
        new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(Bytes.fromHexString(REGULAR_POOL_ID))),
        new ethereum.EventParam(
          'currency0',
          ethereum.Value.fromAddress(Address.fromString(ZORA_CONTENT_TOKEN_ADDRESS)),
        ),
        new ethereum.EventParam(
          'currency1',
          ethereum.Value.fromAddress(Address.fromString(ZORA_CREATOR_TOKEN_ADDRESS)),
        ),
        new ethereum.EventParam('fee', ethereum.Value.fromI32(500)),
        new ethereum.EventParam('tickSpacing', ethereum.Value.fromI32(10)),
        new ethereum.EventParam('hooks', ethereum.Value.fromAddress(Address.fromString(ADDRESS_ZERO))), // No hook
        new ethereum.EventParam(
          'sqrtPriceX96',
          ethereum.Value.fromUnsignedBigInt(BigInt.fromString('79228162514264337593543950336')),
        ),
        new ethereum.EventParam('tick', ethereum.Value.fromI32(0)),
      ],
      MOCK_EVENT.receipt,
    )

    // Execute initialization
    handleInitializeHelper(regularInitializeEvent, TEST_CONFIG)

    // Content token whitelist should remain empty (regular pool shouldn't be added)
    const contentTokenAfter = Token.load(ZORA_CONTENT_TOKEN_ADDRESS)!
    assert.assertTrue(contentTokenAfter.whitelistPools.length == 0)
  })
})

function arrayIncludesString(array: string[], item: string): boolean {
  for (let i = 0; i < array.length; i++) {
    if (array[i] == item) {
      return true
    }
  }
  return false
}
