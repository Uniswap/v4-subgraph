import { Address, BigDecimal, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { afterEach, assert, beforeEach, clearStore, describe, test } from 'matchstick-as'

import { handleSetConfigCollateralHelper } from '../../src/mappings/bank'
import { handleSwapHelper } from '../../src/mappings/swap'
import { SetConfigCollateral as SetConfigCollateralEvent } from '../../src/types/KittycornBank/KittycornBank'
import { Swap } from '../../src/types/PoolManager/PoolManager'
import { Bundle, Token, UserSwapDayData } from '../../src/types/schema'
import { ZERO_BD } from '../../src/utils/constants'
import { convertTokenToDecimal } from '../../src/utils/index'
import { getTrackedAmountUSD } from '../../src/utils/pricing'
import {
  assertObjectMatches,
  createAndStoreTestPool,
  createAndStoreTestToken,
  invokePoolCreatedWithMockedEthCalls,
  MOCK_EVENT,
  POOL_FEE_TIER_05,
  TEST_CONFIG,
  TEST_ETH_PRICE_USD,
  TEST_USDC_DERIVED_ETH,
  TEST_WETH_DERIVED_ETH,
  USDC_MAINNET_FIXTURE,
  USDC_WETH_POOL_ID,
  WBTC_MAINNET_FIXTURE,
  WBTC_WETH_03_MAINNET_POOL_FIXTURE,
  WBTC_WETH_POOL_ID,
  WETH_MAINNET_FIXTURE,
} from './constants'

// Helper to create SetConfigCollateral event
function createSetConfigCollateralEvent(
  poolId: string,
  allowCollateral: boolean,
  maxLTV: BigInt,
  liquidationThreshold: BigInt,
  liquidationFee: BigInt,
): SetConfigCollateralEvent {
  return new SetConfigCollateralEvent(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('poolId', ethereum.Value.fromFixedBytes(Bytes.fromHexString(poolId))),
      new ethereum.EventParam('allowCollateral', ethereum.Value.fromBoolean(allowCollateral)),
      new ethereum.EventParam('maxLTV', ethereum.Value.fromUnsignedBigInt(maxLTV)),
      new ethereum.EventParam('liquidationThreshold', ethereum.Value.fromUnsignedBigInt(liquidationThreshold)),
      new ethereum.EventParam('liquidationFee', ethereum.Value.fromUnsignedBigInt(liquidationFee)),
    ],
    MOCK_EVENT.receipt,
  )
}

// Helper to create Swap event
function createSwapEvent(
  poolId: string,
  sender: Address,
  amount0: BigInt,
  amount1: BigInt,
  sqrtPriceX96: BigInt,
  liquidity: BigInt,
  tick: i32,
  fee: i32,
): Swap {
  return new Swap(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(Bytes.fromHexString(poolId))),
      new ethereum.EventParam('sender', ethereum.Value.fromAddress(sender)),
      new ethereum.EventParam('amount0', ethereum.Value.fromSignedBigInt(amount0)),
      new ethereum.EventParam('amount1', ethereum.Value.fromSignedBigInt(amount1)),
      new ethereum.EventParam('sqrtPriceX96', ethereum.Value.fromSignedBigInt(sqrtPriceX96)),
      new ethereum.EventParam('liquidity', ethereum.Value.fromSignedBigInt(liquidity)),
      new ethereum.EventParam('tick', ethereum.Value.fromI32(tick)),
      new ethereum.EventParam('fee', ethereum.Value.fromI32(fee)),
    ],
    MOCK_EVENT.receipt,
  )
}

describe('handleSetConfigCollateral - PoolAllowCollateral', () => {
  beforeEach(() => {
    invokePoolCreatedWithMockedEthCalls(MOCK_EVENT, TEST_CONFIG)

    const bundle = new Bundle('1')
    bundle.ethPriceUSD = TEST_ETH_PRICE_USD
    bundle.save()
  })

  afterEach(() => {
    clearStore()
  })

  test('success - creates PoolAllowCollateral entity', () => {
    const maxLTV = BigInt.fromI32(7000) // 70%
    const liquidationThreshold = BigInt.fromI32(8000) // 80%
    const liquidationFee = BigInt.fromI32(1500) // 15%

    const event = createSetConfigCollateralEvent(USDC_WETH_POOL_ID, true, maxLTV, liquidationThreshold, liquidationFee)

    handleSetConfigCollateralHelper(event, TEST_CONFIG)

    // Verify PoolAllowCollateral entity is created
    assertObjectMatches('PoolAllowCollateral', USDC_WETH_POOL_ID, [
      ['allowCollateral', 'true'],
      ['maxLTV', maxLTV.toString()],
      ['liquidationThreshold', liquidationThreshold.toString()],
      ['liquidationFee', liquidationFee.toString()],
      ['pool', USDC_WETH_POOL_ID],
    ])
  })

  test('success - updates existing PoolAllowCollateral entity', () => {
    const maxLTV1 = BigInt.fromI32(7000)
    const liquidationThreshold1 = BigInt.fromI32(8000)
    const liquidationFee1 = BigInt.fromI32(1500)

    // Create initial config
    const event1 = createSetConfigCollateralEvent(
      USDC_WETH_POOL_ID,
      true,
      maxLTV1,
      liquidationThreshold1,
      liquidationFee1,
    )
    handleSetConfigCollateralHelper(event1, TEST_CONFIG)

    // Update config
    const maxLTV2 = BigInt.fromI32(6500) // 65%
    const liquidationThreshold2 = BigInt.fromI32(7500) // 75%
    const liquidationFee2 = BigInt.fromI32(1000) // 10%

    const event2 = createSetConfigCollateralEvent(
      USDC_WETH_POOL_ID,
      true,
      maxLTV2,
      liquidationThreshold2,
      liquidationFee2,
    )
    handleSetConfigCollateralHelper(event2, TEST_CONFIG)

    // Verify updated values
    assertObjectMatches('PoolAllowCollateral', USDC_WETH_POOL_ID, [
      ['allowCollateral', 'true'],
      ['maxLTV', maxLTV2.toString()],
      ['liquidationThreshold', liquidationThreshold2.toString()],
      ['liquidationFee', liquidationFee2.toString()],
    ])
  })

  test('success - disables collateral', () => {
    const maxLTV = BigInt.fromI32(7000)
    const liquidationThreshold = BigInt.fromI32(8000)
    const liquidationFee = BigInt.fromI32(1500)

    // Enable first
    const enableEvent = createSetConfigCollateralEvent(
      USDC_WETH_POOL_ID,
      true,
      maxLTV,
      liquidationThreshold,
      liquidationFee,
    )
    handleSetConfigCollateralHelper(enableEvent, TEST_CONFIG)

    // Disable
    const disableEvent = createSetConfigCollateralEvent(
      USDC_WETH_POOL_ID,
      false,
      maxLTV,
      liquidationThreshold,
      liquidationFee,
    )
    handleSetConfigCollateralHelper(disableEvent, TEST_CONFIG)

    assertObjectMatches('PoolAllowCollateral', USDC_WETH_POOL_ID, [['allowCollateral', 'false']])
  })
})

describe('handleSwap - UserSwapDayData', () => {
  beforeEach(() => {
    invokePoolCreatedWithMockedEthCalls(MOCK_EVENT, TEST_CONFIG)

    const bundle = new Bundle('1')
    bundle.ethPriceUSD = TEST_ETH_PRICE_USD
    bundle.save()

    const usdcEntity = Token.load(USDC_MAINNET_FIXTURE.address)!
    usdcEntity.derivedETH = TEST_USDC_DERIVED_ETH
    usdcEntity.save()

    const wethEntity = Token.load(WETH_MAINNET_FIXTURE.address)!
    wethEntity.derivedETH = TEST_WETH_DERIVED_ETH
    wethEntity.save()
  })

  afterEach(() => {
    clearStore()
  })

  test('success - UserSwapDayData NOT created when pool has no collateral config', () => {
    const sender = Address.fromString('0x841B5A0b3DBc473c8A057E2391014aa4C4751351')
    const swapEvent = createSwapEvent(
      USDC_WETH_POOL_ID,
      sender,
      BigInt.fromString('-10007'),
      BigInt.fromString('10000'),
      BigInt.fromString('79228162514264337514315787821'),
      BigInt.fromString('10000000000000000000000'),
      -1,
      500,
    )

    handleSwapHelper(swapEvent, TEST_CONFIG)

    // UserSwapDayData should NOT exist since no PoolAllowCollateral
    const dayId = MOCK_EVENT.block.timestamp.toI32() / 86400
    const userDayId = MOCK_EVENT.transaction.from.toHexString() + '-' + dayId.toString()
    const userSwapDayData = UserSwapDayData.load(userDayId)
    assert.assertNull(userSwapDayData)
  })

  test('success - UserSwapDayData created when pool has collateral config', () => {
    // First, create PoolAllowCollateral
    const maxLTV = BigInt.fromI32(7000)
    const liquidationThreshold = BigInt.fromI32(8000)
    const liquidationFee = BigInt.fromI32(1500)
    const configEvent = createSetConfigCollateralEvent(
      USDC_WETH_POOL_ID,
      true,
      maxLTV,
      liquidationThreshold,
      liquidationFee,
    )
    handleSetConfigCollateralHelper(configEvent, TEST_CONFIG)

    // Now swap
    const sender = Address.fromString('0x841B5A0b3DBc473c8A057E2391014aa4C4751351')
    const swapEvent = createSwapEvent(
      USDC_WETH_POOL_ID,
      sender,
      BigInt.fromString('-10007'),
      BigInt.fromString('10000'),
      BigInt.fromString('79228162514264337514315787821'),
      BigInt.fromString('10000000000000000000000'),
      -1,
      500,
    )

    handleSwapHelper(swapEvent, TEST_CONFIG)

    // UserSwapDayData should exist
    const dayId = MOCK_EVENT.block.timestamp.toI32() / 86400
    const userDayId = MOCK_EVENT.transaction.from.toHexString() + '-' + dayId.toString()

    assertObjectMatches('UserSwapDayData', userDayId, [
      ['user', MOCK_EVENT.transaction.from.toHexString()],
      ['txCount', '1'],
    ])
  })

  test('success - UserSwapDayData accumulates volume and fees on multiple swaps', () => {
    // Create PoolAllowCollateral
    const maxLTV = BigInt.fromI32(7000)
    const liquidationThreshold = BigInt.fromI32(8000)
    const liquidationFee = BigInt.fromI32(1500)
    const configEvent = createSetConfigCollateralEvent(
      USDC_WETH_POOL_ID,
      true,
      maxLTV,
      liquidationThreshold,
      liquidationFee,
    )
    handleSetConfigCollateralHelper(configEvent, TEST_CONFIG)

    const token0 = Token.load(USDC_MAINNET_FIXTURE.address)!
    const token1 = Token.load(WETH_MAINNET_FIXTURE.address)!

    // First swap
    const sender = Address.fromString('0x841B5A0b3DBc473c8A057E2391014aa4C4751351')
    const amount0_1 = BigInt.fromString('-10007')
    const amount1_1 = BigInt.fromString('10000')

    const swapEvent1 = createSwapEvent(
      USDC_WETH_POOL_ID,
      sender,
      amount0_1,
      amount1_1,
      BigInt.fromString('79228162514264337514315787821'),
      BigInt.fromString('10000000000000000000000'),
      -1,
      500,
    )

    // Calculate expected values for first swap
    const amount0Decimal1 = convertTokenToDecimal(amount0_1, BigInt.fromString(USDC_MAINNET_FIXTURE.decimals))
    const amount1Decimal1 = convertTokenToDecimal(amount1_1, BigInt.fromString(WETH_MAINNET_FIXTURE.decimals))
    const amount0Abs1 = amount0Decimal1.lt(ZERO_BD)
      ? amount0Decimal1.times(BigDecimal.fromString('-1'))
      : amount0Decimal1
    const amount1Abs1 = amount1Decimal1.lt(ZERO_BD)
      ? amount1Decimal1.times(BigDecimal.fromString('-1'))
      : amount1Decimal1

    const amountTotalUSDTracked1 = getTrackedAmountUSD(
      amount0Abs1,
      token0,
      amount1Abs1,
      token1,
      TEST_CONFIG.whitelistTokens,
    ).div(BigDecimal.fromString('2'))

    const feeTierBD = BigDecimal.fromString(POOL_FEE_TIER_05.toString())
    const feesUSD1 = amountTotalUSDTracked1.times(feeTierBD).div(BigDecimal.fromString('1000000'))

    handleSwapHelper(swapEvent1, TEST_CONFIG)

    const dayId = MOCK_EVENT.block.timestamp.toI32() / 86400
    const userDayId = MOCK_EVENT.transaction.from.toHexString() + '-' + dayId.toString()

    // Verify after first swap
    assertObjectMatches('UserSwapDayData', userDayId, [
      ['txCount', '1'],
      ['volumeUSD', amountTotalUSDTracked1.toString()],
      ['feesUSD', feesUSD1.toString()],
    ])

    // Second swap
    const amount0_2 = BigInt.fromString('-20000')
    const amount1_2 = BigInt.fromString('20000')

    const swapEvent2 = createSwapEvent(
      USDC_WETH_POOL_ID,
      sender,
      amount0_2,
      amount1_2,
      BigInt.fromString('79228162514264337514315787821'),
      BigInt.fromString('10000000000000000000000'),
      -1,
      500,
    )

    // Calculate expected values for second swap
    const amount0Decimal2 = convertTokenToDecimal(amount0_2, BigInt.fromString(USDC_MAINNET_FIXTURE.decimals))
    const amount1Decimal2 = convertTokenToDecimal(amount1_2, BigInt.fromString(WETH_MAINNET_FIXTURE.decimals))
    const amount0Abs2 = amount0Decimal2.lt(ZERO_BD)
      ? amount0Decimal2.times(BigDecimal.fromString('-1'))
      : amount0Decimal2
    const amount1Abs2 = amount1Decimal2.lt(ZERO_BD)
      ? amount1Decimal2.times(BigDecimal.fromString('-1'))
      : amount1Decimal2

    // Reload tokens to get updated derivedETH
    const token0Updated = Token.load(USDC_MAINNET_FIXTURE.address)!
    const token1Updated = Token.load(WETH_MAINNET_FIXTURE.address)!

    const amountTotalUSDTracked2 = getTrackedAmountUSD(
      amount0Abs2,
      token0Updated,
      amount1Abs2,
      token1Updated,
      TEST_CONFIG.whitelistTokens,
    ).div(BigDecimal.fromString('2'))

    const feesUSD2 = amountTotalUSDTracked2.times(feeTierBD).div(BigDecimal.fromString('1000000'))

    handleSwapHelper(swapEvent2, TEST_CONFIG)

    // Verify accumulated values after second swap
    const expectedTotalVolume = amountTotalUSDTracked1.plus(amountTotalUSDTracked2)
    const expectedTotalFees = feesUSD1.plus(feesUSD2)

    assertObjectMatches('UserSwapDayData', userDayId, [
      ['txCount', '2'],
      ['volumeUSD', expectedTotalVolume.toString()],
      ['feesUSD', expectedTotalFees.toString()],
    ])
  })

  test('success - different users have separate UserSwapDayData entities', () => {
    // Create PoolAllowCollateral
    const maxLTV = BigInt.fromI32(7000)
    const liquidationThreshold = BigInt.fromI32(8000)
    const liquidationFee = BigInt.fromI32(1500)
    const configEvent = createSetConfigCollateralEvent(
      USDC_WETH_POOL_ID,
      true,
      maxLTV,
      liquidationThreshold,
      liquidationFee,
    )
    handleSetConfigCollateralHelper(configEvent, TEST_CONFIG)

    // First user swap (uses MOCK_EVENT.transaction.from)
    const sender1 = Address.fromString('0x841B5A0b3DBc473c8A057E2391014aa4C4751351')
    const swapEvent1 = createSwapEvent(
      USDC_WETH_POOL_ID,
      sender1,
      BigInt.fromString('-10007'),
      BigInt.fromString('10000'),
      BigInt.fromString('79228162514264337514315787821'),
      BigInt.fromString('10000000000000000000000'),
      -1,
      500,
    )

    handleSwapHelper(swapEvent1, TEST_CONFIG)

    const dayId = MOCK_EVENT.block.timestamp.toI32() / 86400
    const user1DayId = MOCK_EVENT.transaction.from.toHexString() + '-' + dayId.toString()

    // Verify first user's data
    assertObjectMatches('UserSwapDayData', user1DayId, [
      ['user', MOCK_EVENT.transaction.from.toHexString()],
      ['txCount', '1'],
    ])
  })

  test('success - UserSwapDayData accumulates across multiple pools', () => {
    // Create second pool (WBTC/WETH)
    const wbtcToken = createAndStoreTestToken(WBTC_MAINNET_FIXTURE)
    wbtcToken.derivedETH = BigDecimal.fromString('20') // 1 WBTC = 20 ETH
    wbtcToken.save()

    createAndStoreTestPool(WBTC_WETH_03_MAINNET_POOL_FIXTURE)

    // Create PoolAllowCollateral for USDC/WETH pool
    const maxLTV = BigInt.fromI32(7000)
    const liquidationThreshold = BigInt.fromI32(8000)
    const liquidationFee = BigInt.fromI32(1500)

    const configEvent1 = createSetConfigCollateralEvent(
      USDC_WETH_POOL_ID,
      true,
      maxLTV,
      liquidationThreshold,
      liquidationFee,
    )
    handleSetConfigCollateralHelper(configEvent1, TEST_CONFIG)

    // Create PoolAllowCollateral for WBTC/WETH pool
    const configEvent2 = createSetConfigCollateralEvent(
      WBTC_WETH_POOL_ID,
      true,
      maxLTV,
      liquidationThreshold,
      liquidationFee,
    )
    handleSetConfigCollateralHelper(configEvent2, TEST_CONFIG)

    const token0Pool1 = Token.load(USDC_MAINNET_FIXTURE.address)!
    const token1Pool1 = Token.load(WETH_MAINNET_FIXTURE.address)!

    // First swap on USDC/WETH pool
    const sender = Address.fromString('0x841B5A0b3DBc473c8A057E2391014aa4C4751351')
    const amount0_1 = BigInt.fromString('-10007')
    const amount1_1 = BigInt.fromString('10000')

    const swapEvent1 = createSwapEvent(
      USDC_WETH_POOL_ID,
      sender,
      amount0_1,
      amount1_1,
      BigInt.fromString('79228162514264337514315787821'),
      BigInt.fromString('10000000000000000000000'),
      -1,
      500,
    )

    // Calculate expected values for first swap
    const amount0Decimal1 = convertTokenToDecimal(amount0_1, BigInt.fromString(USDC_MAINNET_FIXTURE.decimals))
    const amount1Decimal1 = convertTokenToDecimal(amount1_1, BigInt.fromString(WETH_MAINNET_FIXTURE.decimals))
    const amount0Abs1 = amount0Decimal1.lt(ZERO_BD)
      ? amount0Decimal1.times(BigDecimal.fromString('-1'))
      : amount0Decimal1
    const amount1Abs1 = amount1Decimal1.lt(ZERO_BD)
      ? amount1Decimal1.times(BigDecimal.fromString('-1'))
      : amount1Decimal1

    const amountTotalUSDTracked1 = getTrackedAmountUSD(
      amount0Abs1,
      token0Pool1,
      amount1Abs1,
      token1Pool1,
      TEST_CONFIG.whitelistTokens,
    ).div(BigDecimal.fromString('2'))

    const feeTierBD1 = BigDecimal.fromString(POOL_FEE_TIER_05.toString())
    const feesUSD1 = amountTotalUSDTracked1.times(feeTierBD1).div(BigDecimal.fromString('1000000'))

    handleSwapHelper(swapEvent1, TEST_CONFIG)

    const dayId = MOCK_EVENT.block.timestamp.toI32() / 86400
    const userDayId = MOCK_EVENT.transaction.from.toHexString() + '-' + dayId.toString()

    // Verify after first swap (USDC/WETH pool)
    assertObjectMatches('UserSwapDayData', userDayId, [
      ['txCount', '1'],
      ['volumeUSD', amountTotalUSDTracked1.toString()],
      ['feesUSD', feesUSD1.toString()],
    ])

    // Second swap on WBTC/WETH pool
    const token0Pool2 = Token.load(WBTC_MAINNET_FIXTURE.address)!
    const token1Pool2 = Token.load(WETH_MAINNET_FIXTURE.address)!

    const amount0_2 = BigInt.fromString('-100000000') // 1 WBTC (8 decimals)
    const amount1_2 = BigInt.fromString('20000000000000000000') // 20 WETH

    const swapEvent2 = createSwapEvent(
      WBTC_WETH_POOL_ID,
      sender,
      amount0_2,
      amount1_2,
      BigInt.fromString('79228162514264337514315787821'),
      BigInt.fromString('10000000000000000000000'),
      -1,
      3000, // 0.3% fee tier for WBTC/WETH
    )

    // Calculate expected values for second swap
    const amount0Decimal2 = convertTokenToDecimal(amount0_2, BigInt.fromString(WBTC_MAINNET_FIXTURE.decimals))
    const amount1Decimal2 = convertTokenToDecimal(amount1_2, BigInt.fromString(WETH_MAINNET_FIXTURE.decimals))
    const amount0Abs2 = amount0Decimal2.lt(ZERO_BD)
      ? amount0Decimal2.times(BigDecimal.fromString('-1'))
      : amount0Decimal2
    const amount1Abs2 = amount1Decimal2.lt(ZERO_BD)
      ? amount1Decimal2.times(BigDecimal.fromString('-1'))
      : amount1Decimal2

    const amountTotalUSDTracked2 = getTrackedAmountUSD(
      amount0Abs2,
      token0Pool2,
      amount1Abs2,
      token1Pool2,
      TEST_CONFIG.whitelistTokens,
    ).div(BigDecimal.fromString('2'))

    const feeTierBD2 = BigDecimal.fromString('3000')
    const feesUSD2 = amountTotalUSDTracked2.times(feeTierBD2).div(BigDecimal.fromString('1000000'))

    handleSwapHelper(swapEvent2, TEST_CONFIG)

    // Verify accumulated values after second swap (across both pools)
    const expectedTotalVolume = amountTotalUSDTracked1.plus(amountTotalUSDTracked2)
    const expectedTotalFees = feesUSD1.plus(feesUSD2)

    assertObjectMatches('UserSwapDayData', userDayId, [
      ['txCount', '2'],
      ['volumeUSD', expectedTotalVolume.toString()],
      ['feesUSD', expectedTotalFees.toString()],
    ])
  })

  test('success - UserSwapDayData only counts swaps from pools with collateral config', () => {
    // Create second pool (WBTC/WETH) - but NO collateral config
    const wbtcToken = createAndStoreTestToken(WBTC_MAINNET_FIXTURE)
    wbtcToken.derivedETH = BigDecimal.fromString('20')
    wbtcToken.save()

    createAndStoreTestPool(WBTC_WETH_03_MAINNET_POOL_FIXTURE)

    // Only create PoolAllowCollateral for USDC/WETH pool
    const maxLTV = BigInt.fromI32(7000)
    const liquidationThreshold = BigInt.fromI32(8000)
    const liquidationFee = BigInt.fromI32(1500)

    const configEvent = createSetConfigCollateralEvent(
      USDC_WETH_POOL_ID,
      true,
      maxLTV,
      liquidationThreshold,
      liquidationFee,
    )
    handleSetConfigCollateralHelper(configEvent, TEST_CONFIG)

    const token0 = Token.load(USDC_MAINNET_FIXTURE.address)!
    const token1 = Token.load(WETH_MAINNET_FIXTURE.address)!

    // First swap on USDC/WETH pool (has collateral config)
    const sender = Address.fromString('0x841B5A0b3DBc473c8A057E2391014aa4C4751351')
    const amount0_1 = BigInt.fromString('-10007')
    const amount1_1 = BigInt.fromString('10000')

    const swapEvent1 = createSwapEvent(
      USDC_WETH_POOL_ID,
      sender,
      amount0_1,
      amount1_1,
      BigInt.fromString('79228162514264337514315787821'),
      BigInt.fromString('10000000000000000000000'),
      -1,
      500,
    )

    // Calculate expected values for first swap
    const amount0Decimal1 = convertTokenToDecimal(amount0_1, BigInt.fromString(USDC_MAINNET_FIXTURE.decimals))
    const amount1Decimal1 = convertTokenToDecimal(amount1_1, BigInt.fromString(WETH_MAINNET_FIXTURE.decimals))
    const amount0Abs1 = amount0Decimal1.lt(ZERO_BD)
      ? amount0Decimal1.times(BigDecimal.fromString('-1'))
      : amount0Decimal1
    const amount1Abs1 = amount1Decimal1.lt(ZERO_BD)
      ? amount1Decimal1.times(BigDecimal.fromString('-1'))
      : amount1Decimal1

    const amountTotalUSDTracked1 = getTrackedAmountUSD(
      amount0Abs1,
      token0,
      amount1Abs1,
      token1,
      TEST_CONFIG.whitelistTokens,
    ).div(BigDecimal.fromString('2'))

    const feeTierBD = BigDecimal.fromString(POOL_FEE_TIER_05.toString())
    const feesUSD1 = amountTotalUSDTracked1.times(feeTierBD).div(BigDecimal.fromString('1000000'))

    handleSwapHelper(swapEvent1, TEST_CONFIG)

    const dayId = MOCK_EVENT.block.timestamp.toI32() / 86400
    const userDayId = MOCK_EVENT.transaction.from.toHexString() + '-' + dayId.toString()

    // Verify after first swap
    assertObjectMatches('UserSwapDayData', userDayId, [
      ['txCount', '1'],
      ['volumeUSD', amountTotalUSDTracked1.toString()],
      ['feesUSD', feesUSD1.toString()],
    ])

    // Second swap on WBTC/WETH pool (NO collateral config - should NOT count)
    const swapEvent2 = createSwapEvent(
      WBTC_WETH_POOL_ID,
      sender,
      BigInt.fromString('-100000000'),
      BigInt.fromString('20000000000000000000'),
      BigInt.fromString('79228162514264337514315787821'),
      BigInt.fromString('10000000000000000000000'),
      -1,
      3000,
    )

    handleSwapHelper(swapEvent2, TEST_CONFIG)

    // Verify values remain the same (second swap not counted)
    assertObjectMatches('UserSwapDayData', userDayId, [
      ['txCount', '1'], // Still 1, not 2
      ['volumeUSD', amountTotalUSDTracked1.toString()], // Same as before
      ['feesUSD', feesUSD1.toString()], // Same as before
    ])
  })
})
