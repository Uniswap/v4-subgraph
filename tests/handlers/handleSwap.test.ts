import { Address, BigDecimal, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { afterEach, beforeEach, clearStore, describe, test } from 'matchstick-as'

import { handleSwapHelper } from '../../src/mappings/swap'
import { Swap } from '../../src/types/PoolManager/PoolManager'
import { Bundle, Token } from '../../src/types/schema'
import { ZERO_BD } from '../../src/utils/constants'
import { convertTokenToDecimal, safeDiv } from '../../src/utils/index'
import {
  findNativePerToken,
  getNativePriceInUSD,
  getTrackedAmountUSD,
  sqrtPriceX96ToTokenPrices,
} from '../../src/utils/pricing'
import {
  assertObjectMatches,
  invokePoolCreatedWithMockedEthCalls,
  MOCK_EVENT,
  POOL_FEE_TIER_05,
  TEST_CONFIG,
  TEST_ETH_PRICE_USD,
  TEST_USDC_DERIVED_ETH,
  TEST_WETH_DERIVED_ETH,
  USDC_MAINNET_FIXTURE,
  USDC_WETH_POOL_ID,
  WETH_MAINNET_FIXTURE,
} from './constants'

class SwapFixture {
  id: string
  sender: Address
  amount0: BigInt
  amount1: BigInt
  sqrtPriceX96: BigInt
  liquidity: BigInt
  tick: i32
  fee: i32
}

// https://sepolia.etherscan.io/tx/0x55e13046016b653bd125e26917fac1b06dd15bf7b0659701d5e9d00b7b403f2c#eventlog
const SWAP_FIXTURE: SwapFixture = {
  id: USDC_WETH_POOL_ID,
  sender: Address.fromString('0x841B5A0b3DBc473c8A057E2391014aa4C4751351'),
  amount0: BigInt.fromString('-10007'),
  amount1: BigInt.fromString('10000'),
  sqrtPriceX96: BigInt.fromString('79228162514264337514315787821'),
  liquidity: BigInt.fromString('10000000000000000000000'),
  tick: -1,
  fee: 500,
}

// Swap in the opposite direction (token1 in, token0 out) on a pool reporting a
// non-standard per-swap fee, as a dynamic fee pool would.
const DYNAMIC_FEE_SWAP_FIXTURE: SwapFixture = {
  id: USDC_WETH_POOL_ID,
  sender: Address.fromString('0x841B5A0b3DBc473c8A057E2391014aa4C4751351'),
  amount0: BigInt.fromString('10000'),
  amount1: BigInt.fromString('-10007'),
  sqrtPriceX96: BigInt.fromString('79228162514264337514315787821'),
  liquidity: BigInt.fromString('10000000000000000000000'),
  tick: -1,
  fee: 4321,
}

const createSwapEvent = (fixture: SwapFixture): Swap =>
  new Swap(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(Bytes.fromHexString(fixture.id))),
      new ethereum.EventParam('sender', ethereum.Value.fromAddress(fixture.sender)),
      new ethereum.EventParam('amount0', ethereum.Value.fromSignedBigInt(fixture.amount0)),
      new ethereum.EventParam('amount1', ethereum.Value.fromSignedBigInt(fixture.amount1)),
      new ethereum.EventParam('sqrtPriceX96', ethereum.Value.fromSignedBigInt(fixture.sqrtPriceX96)),
      new ethereum.EventParam('liquidity', ethereum.Value.fromSignedBigInt(fixture.liquidity)),
      new ethereum.EventParam('tick', ethereum.Value.fromI32(fixture.tick)),
      new ethereum.EventParam('fee', ethereum.Value.fromI32(fixture.fee)),
    ],
    MOCK_EVENT.receipt,
  )

const SWAP_EVENT = createSwapEvent(SWAP_FIXTURE)

describe('handleSwap', () => {
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

  test('success', () => {
    const token0 = Token.load(USDC_MAINNET_FIXTURE.address)!
    const token1 = Token.load(WETH_MAINNET_FIXTURE.address)!

    const amount0 = convertTokenToDecimal(SWAP_FIXTURE.amount0, BigInt.fromString(USDC_MAINNET_FIXTURE.decimals)).times(
      BigDecimal.fromString('-1'),
    )
    const amount1 = convertTokenToDecimal(SWAP_FIXTURE.amount1, BigInt.fromString(WETH_MAINNET_FIXTURE.decimals)).times(
      BigDecimal.fromString('-1'),
    )

    const amount0Abs = amount0.lt(ZERO_BD) ? amount0.times(BigDecimal.fromString('-1')) : amount0
    const amount1Abs = amount1.lt(ZERO_BD) ? amount1.times(BigDecimal.fromString('-1')) : amount1

    // calculate this before calling handleSwapHelper because it updates the derivedETH of the tokens which will affect calculations
    const amountTotalUSDTracked = getTrackedAmountUSD(
      amount0Abs,
      token0,
      amount1Abs,
      token1,
      TEST_CONFIG.whitelistTokens,
    ).div(BigDecimal.fromString('2'))

    const amount0ETH = amount0Abs.times(TEST_USDC_DERIVED_ETH)
    const amount1ETH = amount1Abs.times(TEST_WETH_DERIVED_ETH)

    const amount0USD = amount0ETH.times(TEST_ETH_PRICE_USD)
    const amount1USD = amount1ETH.times(TEST_ETH_PRICE_USD)

    const amountTotalETHTRacked = safeDiv(amountTotalUSDTracked, TEST_ETH_PRICE_USD)
    const amountTotalUSDUntracked = amount0USD.plus(amount1USD).div(BigDecimal.fromString('2'))

    const feeTierBD = BigDecimal.fromString(POOL_FEE_TIER_05.toString())
    const feesETH = amountTotalETHTRacked.times(feeTierBD).div(BigDecimal.fromString('1000000'))
    const feesUSD = amountTotalUSDTracked.times(feeTierBD).div(BigDecimal.fromString('1000000'))

    // TVL only tracks the value backing active liquidity: the swap fee retained from the
    // input token (token0 here) accrues to LPs and is excluded from the TVL deltas
    const feeRate = feeTierBD.div(BigDecimal.fromString('1000000'))
    const amount0TVLDelta = amount0.gt(ZERO_BD) ? amount0.minus(amount0.times(feeRate)) : amount0
    const amount1TVLDelta = amount1.gt(ZERO_BD) ? amount1.minus(amount1.times(feeRate)) : amount1

    handleSwapHelper(SWAP_EVENT, TEST_CONFIG)

    const newEthPrice = getNativePriceInUSD(USDC_WETH_POOL_ID, true)
    const newPoolPrices = sqrtPriceX96ToTokenPrices(
      SWAP_FIXTURE.sqrtPriceX96,
      token0,
      token1,
      TEST_CONFIG.nativeTokenDetails,
    )
    const newToken0DerivedETH = findNativePerToken(
      token0,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
    )
    const newToken1DerivedETH = findNativePerToken(
      token1,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
    )

    const totalValueLockedETH = amount0TVLDelta
      .times(newToken0DerivedETH)
      .plus(amount1TVLDelta.times(newToken1DerivedETH))
    const token0TVLUSD = amount0TVLDelta.times(newToken0DerivedETH).times(newEthPrice)
    const token1TVLUSD = amount1TVLDelta.times(newToken1DerivedETH).times(newEthPrice)

    assertObjectMatches('PoolManager', TEST_CONFIG.poolManagerAddress, [
      ['txCount', '1'],
      ['totalVolumeETH', amountTotalETHTRacked.toString()],
      ['totalVolumeUSD', amountTotalUSDTracked.toString()],
      ['untrackedVolumeUSD', amountTotalUSDUntracked.toString()],
      ['totalFeesETH', feesETH.toString()],
      ['totalFeesUSD', feesUSD.toString()],
      ['totalValueLockedETH', totalValueLockedETH.toString()],
      ['totalValueLockedUSD', totalValueLockedETH.times(newEthPrice).toString()],
    ])

    assertObjectMatches('Pool', USDC_WETH_POOL_ID, [
      ['volumeToken0', amount0Abs.toString()],
      ['volumeToken1', amount1Abs.toString()],
      ['volumeUSD', amountTotalUSDTracked.toString()],
      ['untrackedVolumeUSD', amountTotalUSDUntracked.toString()],
      ['feesUSD', feesUSD.toString()],
      ['txCount', '1'],
      ['liquidity', SWAP_FIXTURE.liquidity.toString()],
      ['tick', SWAP_FIXTURE.tick.toString()],
      ['sqrtPrice', SWAP_FIXTURE.sqrtPriceX96.toString()],
      ['totalValueLockedToken0', amount0TVLDelta.toString()],
      ['totalValueLockedToken1', amount1TVLDelta.toString()],
      ['token0Price', newPoolPrices[0].toString()],
      ['token1Price', newPoolPrices[1].toString()],
      ['totalValueLockedETH', totalValueLockedETH.toString()],
      ['totalValueLockedUSD', totalValueLockedETH.times(newEthPrice).toString()],
    ])

    assertObjectMatches('Token', USDC_MAINNET_FIXTURE.address, [
      ['volume', amount0Abs.toString()],
      ['totalValueLocked', amount0TVLDelta.toString()],
      ['volumeUSD', amountTotalUSDTracked.toString()],
      ['untrackedVolumeUSD', amountTotalUSDUntracked.toString()],
      ['feesUSD', feesUSD.toString()],
      ['txCount', '1'],
      ['derivedETH', newToken0DerivedETH.toString()],
      ['totalValueLockedUSD', token0TVLUSD.toString()],
    ])

    assertObjectMatches('Token', WETH_MAINNET_FIXTURE.address, [
      ['volume', amount1Abs.toString()],
      ['totalValueLocked', amount1TVLDelta.toString()],
      ['volumeUSD', amountTotalUSDTracked.toString()],
      ['untrackedVolumeUSD', amountTotalUSDUntracked.toString()],
      ['feesUSD', feesUSD.toString()],
      ['txCount', '1'],
      ['derivedETH', newToken1DerivedETH.toString()],
      ['totalValueLockedUSD', token1TVLUSD.toString()],
    ])

    assertObjectMatches('Swap', MOCK_EVENT.transaction.hash.toHexString() + '-' + MOCK_EVENT.logIndex.toString(), [
      ['transaction', MOCK_EVENT.transaction.hash.toHexString()],
      ['timestamp', MOCK_EVENT.block.timestamp.toString()],
      ['pool', USDC_WETH_POOL_ID],
      ['token0', USDC_MAINNET_FIXTURE.address],
      ['token1', WETH_MAINNET_FIXTURE.address],
      ['sender', SWAP_FIXTURE.sender.toHexString()],
      ['origin', MOCK_EVENT.transaction.from.toHexString()],
      // ['recipient', SWAP_FIXTURE.recipient.toHexString()],
      ['amount0', amount0.toString()],
      ['amount1', amount1.toString()],
      ['amountUSD', amountTotalUSDTracked.toString()],
      ['tick', SWAP_FIXTURE.tick.toString()],
      ['sqrtPriceX96', SWAP_FIXTURE.sqrtPriceX96.toString()],
      ['logIndex', MOCK_EVENT.logIndex.toString()],
    ])

    const dayId = MOCK_EVENT.block.timestamp.toI32() / 86400
    const hourId = MOCK_EVENT.block.timestamp.toI32() / 3600

    assertObjectMatches('UniswapDayData', dayId.toString(), [
      ['volumeETH', amountTotalETHTRacked.toString()],
      ['volumeUSD', amountTotalUSDTracked.toString()],
      ['feesUSD', feesUSD.toString()],
    ])

    assertObjectMatches('PoolDayData', USDC_WETH_POOL_ID + '-' + dayId.toString(), [
      ['volumeUSD', amountTotalUSDTracked.toString()],
      ['volumeToken0', amount0Abs.toString()],
      ['volumeToken1', amount1Abs.toString()],
      ['feesUSD', feesUSD.toString()],
    ])

    assertObjectMatches('PoolHourData', USDC_WETH_POOL_ID + '-' + hourId.toString(), [
      ['volumeUSD', amountTotalUSDTracked.toString()],
      ['volumeToken0', amount0Abs.toString()],
      ['volumeToken1', amount1Abs.toString()],
      ['feesUSD', feesUSD.toString()],
    ])

    assertObjectMatches('TokenDayData', USDC_MAINNET_FIXTURE.address + '-' + dayId.toString(), [
      ['volume', amount0Abs.toString()],
      ['volumeUSD', amountTotalUSDTracked.toString()],
      ['untrackedVolumeUSD', amountTotalUSDTracked.toString()],
      ['feesUSD', feesUSD.toString()],
    ])

    assertObjectMatches('TokenDayData', WETH_MAINNET_FIXTURE.address + '-' + dayId.toString(), [
      ['volume', amount1Abs.toString()],
      ['volumeUSD', amountTotalUSDTracked.toString()],
      ['untrackedVolumeUSD', amountTotalUSDTracked.toString()],
      ['feesUSD', feesUSD.toString()],
    ])

    assertObjectMatches('TokenHourData', USDC_MAINNET_FIXTURE.address + '-' + hourId.toString(), [
      ['volume', amount0Abs.toString()],
      ['volumeUSD', amountTotalUSDTracked.toString()],
      ['untrackedVolumeUSD', amountTotalUSDTracked.toString()],
      ['feesUSD', feesUSD.toString()],
    ])

    assertObjectMatches('TokenHourData', WETH_MAINNET_FIXTURE.address + '-' + hourId.toString(), [
      ['volume', amount1Abs.toString()],
      ['volumeUSD', amountTotalUSDTracked.toString()],
      ['untrackedVolumeUSD', amountTotalUSDTracked.toString()],
      ['feesUSD', feesUSD.toString()],
    ])
  })

  test('success - TVL excludes the swap fee retained from the input token (token0 input)', () => {
    const amount0 = convertTokenToDecimal(SWAP_FIXTURE.amount0, BigInt.fromString(USDC_MAINNET_FIXTURE.decimals)).times(
      BigDecimal.fromString('-1'),
    )
    const amount1 = convertTokenToDecimal(SWAP_FIXTURE.amount1, BigInt.fromString(WETH_MAINNET_FIXTURE.decimals)).times(
      BigDecimal.fromString('-1'),
    )

    handleSwapHelper(SWAP_EVENT, TEST_CONFIG)

    const feeRate = BigDecimal.fromString(SWAP_FIXTURE.fee.toString()).div(BigDecimal.fromString('1000000'))
    // token0 is the input token (positive delta into the pool), so the retained fee is
    // excluded from its TVL delta; token1 leaves the pool in full
    const amount0TVLDelta = amount0.minus(amount0.times(feeRate))
    const amount1TVLDelta = amount1

    assertObjectMatches('Pool', USDC_WETH_POOL_ID, [
      ['totalValueLockedToken0', amount0TVLDelta.toString()],
      ['totalValueLockedToken1', amount1TVLDelta.toString()],
    ])

    assertObjectMatches('Token', USDC_MAINNET_FIXTURE.address, [['totalValueLocked', amount0TVLDelta.toString()]])

    assertObjectMatches('Token', WETH_MAINNET_FIXTURE.address, [['totalValueLocked', amount1TVLDelta.toString()]])
  })

  test('success - TVL excludes the per-swap event fee (dynamic fee, token1 input)', () => {
    const swapEvent = createSwapEvent(DYNAMIC_FEE_SWAP_FIXTURE)

    const amount0 = convertTokenToDecimal(
      DYNAMIC_FEE_SWAP_FIXTURE.amount0,
      BigInt.fromString(USDC_MAINNET_FIXTURE.decimals),
    ).times(BigDecimal.fromString('-1'))
    const amount1 = convertTokenToDecimal(
      DYNAMIC_FEE_SWAP_FIXTURE.amount1,
      BigInt.fromString(WETH_MAINNET_FIXTURE.decimals),
    ).times(BigDecimal.fromString('-1'))

    handleSwapHelper(swapEvent, TEST_CONFIG)

    // the fee rate comes from the swap event, not the pool's static fee tier - this is
    // how dynamic fee pools report the fee actually charged on each swap
    const dynamicFeeBD = BigDecimal.fromString(DYNAMIC_FEE_SWAP_FIXTURE.fee.toString())
    const feeRate = dynamicFeeBD.div(BigDecimal.fromString('1000000'))
    // token1 is the input token (positive delta into the pool), so only its TVL delta is
    // reduced by the retained fee; token0 leaves the pool in full
    const amount0TVLDelta = amount0
    const amount1TVLDelta = amount1.minus(amount1.times(feeRate))

    assertObjectMatches('Pool', USDC_WETH_POOL_ID, [
      ['feeTier', DYNAMIC_FEE_SWAP_FIXTURE.fee.toString()],
      ['totalValueLockedToken0', amount0TVLDelta.toString()],
      ['totalValueLockedToken1', amount1TVLDelta.toString()],
    ])

    assertObjectMatches('Token', USDC_MAINNET_FIXTURE.address, [['totalValueLocked', amount0TVLDelta.toString()]])

    assertObjectMatches('Token', WETH_MAINNET_FIXTURE.address, [['totalValueLocked', amount1TVLDelta.toString()]])
  })
})
