import { Address, BigDecimal, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { afterEach, assert, beforeEach, clearStore, describe, test } from 'matchstick-as'

import { handleModifyLiquidityHelper } from '../../src/mappings/modifyLiquidity'
import { ModifyLiquidity } from '../../src/types/PoolManager/PoolManager'
import { Bundle, LiquidityPosition, Pool, Token } from '../../src/types/schema'
import { ONE_BD, ZERO_BD, ZERO_BI } from '../../src/utils/constants'
import { convertTokenToDecimal, fastExponentiation, safeDiv } from '../../src/utils/index'
import { TickMath } from '../../src/utils/liquidityMath/tickMath'
import {
  assertObjectMatches,
  invokePoolCreatedWithMockedEthCalls,
  KITTYCORN_POSITION_MANAGER_ADDRESS,
  MOCK_EVENT,
  TEST_CONFIG,
  TEST_ETH_PRICE_USD,
  TEST_USDC_DERIVED_ETH,
  TEST_WETH_DERIVED_ETH,
  USDC_MAINNET_FIXTURE,
  USDC_WETH_POOL_ID,
  WETH_MAINNET_FIXTURE,
} from './constants'

class ModifyLiquidityFixture {
  id: string
  sender: Address
  tickLower: i32
  tickUpper: i32
  liquidityDelta: BigInt
  salt: Bytes
}

// Default salt for non-Kittycorn PM events (tokenId = 0)
const DEFAULT_SALT = Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000000') as Bytes
// Salt for Kittycorn PM events (tokenId = 1)
const KITTYCORN_SALT = Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000001') as Bytes

const MODIFY_LIQUIDITY_FIXTURE_ADD: ModifyLiquidityFixture = {
  id: USDC_WETH_POOL_ID,
  sender: Address.fromString('0x39BF2eFF94201cfAA471932655404F63315147a4'), // Provided sender address
  tickLower: -600,
  tickUpper: 600,
  liquidityDelta: BigInt.fromString('10000000000000000000000'), // Provided liquidity delta
  salt: DEFAULT_SALT,
}

const MODIFY_LIQUIDITY_FIXTURE_REMOVE: ModifyLiquidityFixture = {
  id: USDC_WETH_POOL_ID,
  sender: Address.fromString('0x39BF2eFF94201cfAA471932655404F63315147a4'), // Provided sender address
  tickLower: -600,
  tickUpper: 600,
  liquidityDelta: BigInt.fromString('-10000000000000000000000'), // Provided liquidity delta
  salt: DEFAULT_SALT,
}

const id = Bytes.fromHexString(USDC_WETH_POOL_ID) as Bytes

const MODIFY_LIQUIDITY_EVENT_ADD = new ModifyLiquidity(
  MOCK_EVENT.address,
  MOCK_EVENT.logIndex,
  MOCK_EVENT.transactionLogIndex,
  MOCK_EVENT.logType,
  MOCK_EVENT.block,
  MOCK_EVENT.transaction,
  [
    new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(id)),
    new ethereum.EventParam('sender', ethereum.Value.fromAddress(MODIFY_LIQUIDITY_FIXTURE_ADD.sender)),
    new ethereum.EventParam('tickLower', ethereum.Value.fromI32(MODIFY_LIQUIDITY_FIXTURE_ADD.tickLower as i32)),
    new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(MODIFY_LIQUIDITY_FIXTURE_ADD.tickUpper as i32)),
    new ethereum.EventParam(
      'liquidityDelta',
      ethereum.Value.fromSignedBigInt(MODIFY_LIQUIDITY_FIXTURE_ADD.liquidityDelta),
    ),
    new ethereum.EventParam('salt', ethereum.Value.fromFixedBytes(MODIFY_LIQUIDITY_FIXTURE_ADD.salt)),
  ],
  MOCK_EVENT.receipt,
)

const MODIFY_LIQUIDITY_EVENT_REMOVE = new ModifyLiquidity(
  MOCK_EVENT.address,
  MOCK_EVENT.logIndex,
  MOCK_EVENT.transactionLogIndex,
  MOCK_EVENT.logType,
  MOCK_EVENT.block,
  MOCK_EVENT.transaction,
  [
    new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(id)),
    new ethereum.EventParam('sender', ethereum.Value.fromAddress(MODIFY_LIQUIDITY_FIXTURE_REMOVE.sender)),
    new ethereum.EventParam('tickLower', ethereum.Value.fromI32(MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickLower as i32)),
    new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickUpper as i32)),
    new ethereum.EventParam(
      'liquidityDelta',
      ethereum.Value.fromSignedBigInt(MODIFY_LIQUIDITY_FIXTURE_REMOVE.liquidityDelta),
    ),
    new ethereum.EventParam('salt', ethereum.Value.fromFixedBytes(MODIFY_LIQUIDITY_FIXTURE_REMOVE.salt)),
  ],
  MOCK_EVENT.receipt,
)

describe('handleModifyLiquidity', () => {
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

  test('success - add liquidity event, pool tick is between tickUpper and tickLower', () => {
    // put the pools tick in range
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.tick = BigInt.fromI32(MODIFY_LIQUIDITY_FIXTURE_ADD.tickLower + MODIFY_LIQUIDITY_FIXTURE_ADD.tickUpper).div(
      BigInt.fromI32(2),
    )
    pool.sqrtPrice = TickMath.getSqrtRatioAtTick(pool.tick!.toI32())
    pool.save()

    handleModifyLiquidityHelper(MODIFY_LIQUIDITY_EVENT_ADD, TEST_CONFIG)

    const amountToken0 = convertTokenToDecimal(
      BigInt.fromString('295530108791371696809'),
      BigInt.fromString(USDC_MAINNET_FIXTURE.decimals),
    )
    const amountToken1 = convertTokenToDecimal(
      BigInt.fromString('295530108791371696809'),
      BigInt.fromString(WETH_MAINNET_FIXTURE.decimals),
    )

    const poolTotalValueLockedETH = amountToken0
      .times(TEST_USDC_DERIVED_ETH)
      .plus(amountToken1.times(TEST_WETH_DERIVED_ETH))
    const poolTotalValueLockedUSD = poolTotalValueLockedETH.times(TEST_ETH_PRICE_USD)

    assertObjectMatches('PoolManager', TEST_CONFIG.poolManagerAddress, [
      ['txCount', '1'],
      ['totalValueLockedETH', poolTotalValueLockedETH.toString()],
      ['totalValueLockedUSD', poolTotalValueLockedUSD.toString()],
    ])

    assertObjectMatches('Pool', USDC_WETH_POOL_ID, [
      ['txCount', '1'],
      ['liquidity', MODIFY_LIQUIDITY_FIXTURE_ADD.liquidityDelta.toString()],
      ['totalValueLockedToken0', amountToken0.toString()],
      ['totalValueLockedToken1', amountToken1.toString()],
      ['totalValueLockedETH', poolTotalValueLockedETH.toString()],
      ['totalValueLockedUSD', poolTotalValueLockedUSD.toString()],
    ])

    assertObjectMatches('Token', USDC_MAINNET_FIXTURE.address, [
      ['txCount', '1'],
      ['totalValueLocked', amountToken0.toString()],
      ['totalValueLockedUSD', amountToken0.times(TEST_USDC_DERIVED_ETH.times(TEST_ETH_PRICE_USD)).toString()],
    ])

    assertObjectMatches('Token', WETH_MAINNET_FIXTURE.address, [
      ['txCount', '1'],
      ['totalValueLocked', amountToken1.toString()],
      ['totalValueLockedUSD', amountToken1.times(TEST_WETH_DERIVED_ETH.times(TEST_ETH_PRICE_USD)).toString()],
    ])
    assertObjectMatches(
      'ModifyLiquidity',
      MOCK_EVENT.transaction.hash.toHexString() + '-' + MOCK_EVENT.logIndex.toString(),
      [
        ['transaction', MOCK_EVENT.transaction.hash.toHexString()],
        ['timestamp', MOCK_EVENT.block.timestamp.toString()],
        ['pool', USDC_WETH_POOL_ID],
        ['token0', USDC_MAINNET_FIXTURE.address],
        ['token1', WETH_MAINNET_FIXTURE.address],
        // ['owner', MODIFY_LIQUIDITY_FIXTURE.owner.toHexString()],
        ['sender', MODIFY_LIQUIDITY_FIXTURE_ADD.sender.toHexString()],
        ['origin', MOCK_EVENT.transaction.from.toHexString()],
        ['amount', MODIFY_LIQUIDITY_FIXTURE_ADD.liquidityDelta.toString()],
        ['amount0', amountToken0.toString()],
        ['amount1', amountToken1.toString()],
        ['amountUSD', poolTotalValueLockedUSD.toString()],
        ['tickUpper', MODIFY_LIQUIDITY_FIXTURE_ADD.tickUpper.toString()],
        ['tickLower', MODIFY_LIQUIDITY_FIXTURE_ADD.tickLower.toString()],
        ['logIndex', MOCK_EVENT.logIndex.toString()],
      ],
    )

    const lowerTickPrice = fastExponentiation(BigDecimal.fromString('1.0001'), MODIFY_LIQUIDITY_FIXTURE_ADD.tickLower)
    assertObjectMatches('Tick', USDC_WETH_POOL_ID + '#' + MODIFY_LIQUIDITY_FIXTURE_ADD.tickLower.toString(), [
      ['tickIdx', MODIFY_LIQUIDITY_FIXTURE_ADD.tickLower.toString()],
      ['pool', USDC_WETH_POOL_ID],
      ['poolAddress', USDC_WETH_POOL_ID],
      ['createdAtTimestamp', MOCK_EVENT.block.timestamp.toString()],
      ['createdAtBlockNumber', MOCK_EVENT.block.number.toString()],
      ['liquidityGross', MODIFY_LIQUIDITY_FIXTURE_ADD.liquidityDelta.toString()],
      ['liquidityNet', MODIFY_LIQUIDITY_FIXTURE_ADD.liquidityDelta.toString()],
      ['price0', lowerTickPrice.toString()],
      ['price1', safeDiv(ONE_BD, lowerTickPrice).toString()],
    ])

    const upperTickPrice = fastExponentiation(BigDecimal.fromString('1.0001'), MODIFY_LIQUIDITY_FIXTURE_ADD.tickUpper)
    assertObjectMatches('Tick', USDC_WETH_POOL_ID + '#' + MODIFY_LIQUIDITY_FIXTURE_ADD.tickUpper.toString(), [
      ['tickIdx', MODIFY_LIQUIDITY_FIXTURE_ADD.tickUpper.toString()],
      ['pool', USDC_WETH_POOL_ID],
      ['poolAddress', USDC_WETH_POOL_ID],
      ['createdAtTimestamp', MOCK_EVENT.block.timestamp.toString()],
      ['createdAtBlockNumber', MOCK_EVENT.block.number.toString()],
      ['liquidityGross', MODIFY_LIQUIDITY_FIXTURE_ADD.liquidityDelta.toString()],
      ['liquidityNet', MODIFY_LIQUIDITY_FIXTURE_ADD.liquidityDelta.neg().toString()],
      ['price0', upperTickPrice.toString()],
      ['price1', safeDiv(ONE_BD, upperTickPrice).toString()],
    ])
  })

  test('success - remove liquidity event, pool tick is between tickUpper and tickLower', () => {
    // put the pools tick in range
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.tick = BigInt.fromI32(
      MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickLower + MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickUpper,
    ).div(BigInt.fromI32(2))
    pool.sqrtPrice = TickMath.getSqrtRatioAtTick(pool.tick!.toI32())
    pool.save()

    handleModifyLiquidityHelper(MODIFY_LIQUIDITY_EVENT_REMOVE, TEST_CONFIG)

    const amountToken0 = convertTokenToDecimal(
      BigInt.fromString('-295530108791371696808'),
      BigInt.fromString(USDC_MAINNET_FIXTURE.decimals),
    )
    const amountToken1 = convertTokenToDecimal(
      BigInt.fromString('-295530108791371696808'),
      BigInt.fromString(WETH_MAINNET_FIXTURE.decimals),
    )
    const poolTotalValueLockedETH = amountToken0
      .times(TEST_USDC_DERIVED_ETH)
      .plus(amountToken1.times(TEST_WETH_DERIVED_ETH))
    const poolTotalValueLockedUSD = poolTotalValueLockedETH.times(TEST_ETH_PRICE_USD)

    assertObjectMatches('PoolManager', TEST_CONFIG.poolManagerAddress, [
      ['txCount', '1'],
      ['totalValueLockedETH', poolTotalValueLockedETH.toString()],
      ['totalValueLockedUSD', poolTotalValueLockedUSD.toString()],
    ])

    assertObjectMatches('Pool', USDC_WETH_POOL_ID, [
      ['txCount', '1'],
      ['liquidity', MODIFY_LIQUIDITY_FIXTURE_REMOVE.liquidityDelta.toString()],
      ['totalValueLockedToken0', amountToken0.toString()],
      ['totalValueLockedToken1', amountToken1.toString()],
      ['totalValueLockedETH', poolTotalValueLockedETH.toString()],
      ['totalValueLockedUSD', poolTotalValueLockedUSD.toString()],
    ])

    assertObjectMatches('Token', USDC_MAINNET_FIXTURE.address, [
      ['txCount', '1'],
      ['totalValueLocked', amountToken0.toString()],
      ['totalValueLockedUSD', amountToken0.times(TEST_USDC_DERIVED_ETH.times(TEST_ETH_PRICE_USD)).toString()],
    ])

    assertObjectMatches('Token', WETH_MAINNET_FIXTURE.address, [
      ['txCount', '1'],
      ['totalValueLocked', amountToken1.toString()],
      ['totalValueLockedUSD', amountToken1.times(TEST_WETH_DERIVED_ETH.times(TEST_ETH_PRICE_USD)).toString()],
    ])
    assertObjectMatches(
      'ModifyLiquidity',
      MOCK_EVENT.transaction.hash.toHexString() + '-' + MOCK_EVENT.logIndex.toString(),
      [
        ['transaction', MOCK_EVENT.transaction.hash.toHexString()],
        ['timestamp', MOCK_EVENT.block.timestamp.toString()],
        ['pool', USDC_WETH_POOL_ID],
        ['token0', USDC_MAINNET_FIXTURE.address],
        ['token1', WETH_MAINNET_FIXTURE.address],
        ['sender', MODIFY_LIQUIDITY_FIXTURE_REMOVE.sender.toHexString()],
        ['origin', MOCK_EVENT.transaction.from.toHexString()],
        ['amount', MODIFY_LIQUIDITY_FIXTURE_REMOVE.liquidityDelta.toString()],
        ['amount0', amountToken0.toString()],
        ['amount1', amountToken1.toString()],
        ['amountUSD', poolTotalValueLockedUSD.toString()],
        ['tickUpper', MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickUpper.toString()],
        ['tickLower', MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickLower.toString()],
        ['logIndex', MOCK_EVENT.logIndex.toString()],
      ],
    )

    const lowerTickPrice = fastExponentiation(
      BigDecimal.fromString('1.0001'),
      MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickLower,
    )
    assertObjectMatches('Tick', USDC_WETH_POOL_ID + '#' + MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickLower.toString(), [
      ['tickIdx', MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickLower.toString()],
      ['pool', USDC_WETH_POOL_ID],
      ['poolAddress', USDC_WETH_POOL_ID],
      ['createdAtTimestamp', MOCK_EVENT.block.timestamp.toString()],
      ['createdAtBlockNumber', MOCK_EVENT.block.number.toString()],
      ['liquidityGross', MODIFY_LIQUIDITY_FIXTURE_REMOVE.liquidityDelta.toString()],
      ['liquidityNet', MODIFY_LIQUIDITY_FIXTURE_REMOVE.liquidityDelta.toString()],
      ['price0', lowerTickPrice.toString()],
      ['price1', safeDiv(ONE_BD, lowerTickPrice).toString()],
    ])

    const upperTickPrice = fastExponentiation(
      BigDecimal.fromString('1.0001'),
      MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickUpper,
    )
    assertObjectMatches('Tick', USDC_WETH_POOL_ID + '#' + MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickUpper.toString(), [
      ['tickIdx', MODIFY_LIQUIDITY_FIXTURE_REMOVE.tickUpper.toString()],
      ['pool', USDC_WETH_POOL_ID],
      ['poolAddress', USDC_WETH_POOL_ID],
      ['createdAtTimestamp', MOCK_EVENT.block.timestamp.toString()],
      ['createdAtBlockNumber', MOCK_EVENT.block.number.toString()],
      ['liquidityGross', MODIFY_LIQUIDITY_FIXTURE_REMOVE.liquidityDelta.toString()],
      ['liquidityNet', MODIFY_LIQUIDITY_FIXTURE_REMOVE.liquidityDelta.neg().toString()],
      ['price0', upperTickPrice.toString()],
      ['price1', safeDiv(ONE_BD, upperTickPrice).toString()],
    ])
  })

  test('success - add liquidity event, pool tick is not between tickUpper and tickLower', () => {
    // put the pools tick out of range
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.tick = BigInt.fromI32(MODIFY_LIQUIDITY_FIXTURE_ADD.tickLower - 1)
    const liquidityBeforeModifyLiquidity = pool.liquidity
    pool.save()

    handleModifyLiquidityHelper(MODIFY_LIQUIDITY_EVENT_ADD, TEST_CONFIG)

    // liquidity should not be updated
    assertObjectMatches('Pool', USDC_WETH_POOL_ID, [['liquidity', liquidityBeforeModifyLiquidity.toString()]])
  })

  test('success - amounts are correct for remove liquidity event with currentTick just under upper tick', () => {
    const FIXTURE: ModifyLiquidityFixture = {
      id: USDC_WETH_POOL_ID,
      sender: Address.fromString('0x39BF2eFF94201cfAA471932655404F63315147a4'),
      tickLower: 16080,
      tickUpper: 21180,
      liquidityDelta: BigInt.fromString('-171307279129958064896084173'),
      salt: DEFAULT_SALT,
    }

    const event = new ModifyLiquidity(
      MOCK_EVENT.address,
      MOCK_EVENT.logIndex,
      MOCK_EVENT.transactionLogIndex,
      MOCK_EVENT.logType,
      MOCK_EVENT.block,
      MOCK_EVENT.transaction,
      [
        new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(id)),
        new ethereum.EventParam('sender', ethereum.Value.fromAddress(FIXTURE.sender)),
        new ethereum.EventParam('tickLower', ethereum.Value.fromI32(FIXTURE.tickLower)),
        new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(FIXTURE.tickUpper)),
        new ethereum.EventParam('liquidityDelta', ethereum.Value.fromSignedBigInt(FIXTURE.liquidityDelta)),
        new ethereum.EventParam('salt', ethereum.Value.fromFixedBytes(FIXTURE.salt)),
      ],
      MOCK_EVENT.receipt,
    )

    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.tick = BigInt.fromI32(21179)
    pool.sqrtPrice = BigInt.fromString('228441206771431211303324095474')
    pool.save()

    handleModifyLiquidityHelper(event, TEST_CONFIG)

    const expectedAmount0 = BigDecimal.fromString('-0.000000002367391256')
    const expectedAmount1 = BigDecimal.fromString('-111171964.475622427888514086')
    assertObjectMatches(
      'ModifyLiquidity',
      MOCK_EVENT.transaction.hash.toHexString() + '-' + MOCK_EVENT.logIndex.toString(),
      [
        ['amount0', expectedAmount0.toString()],
        ['amount1', expectedAmount1.toString()],
      ],
    )
  })

  test('success - LiquidityPosition created when sender is Kittycorn Position Manager', () => {
    // Sender is the Kittycorn Position Manager address
    const kittycornPMAddress = Address.fromString(KITTYCORN_POSITION_MANAGER_ADDRESS)
    const tokenId = '1' // tokenId derived from salt

    const FIXTURE: ModifyLiquidityFixture = {
      id: USDC_WETH_POOL_ID,
      sender: kittycornPMAddress,
      tickLower: -600,
      tickUpper: 600,
      liquidityDelta: BigInt.fromString('10000000000000000000000'),
      salt: KITTYCORN_SALT,
    }

    const event = new ModifyLiquidity(
      MOCK_EVENT.address,
      MOCK_EVENT.logIndex,
      MOCK_EVENT.transactionLogIndex,
      MOCK_EVENT.logType,
      MOCK_EVENT.block,
      MOCK_EVENT.transaction,
      [
        new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(id)),
        new ethereum.EventParam('sender', ethereum.Value.fromAddress(FIXTURE.sender)),
        new ethereum.EventParam('tickLower', ethereum.Value.fromI32(FIXTURE.tickLower)),
        new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(FIXTURE.tickUpper)),
        new ethereum.EventParam('liquidityDelta', ethereum.Value.fromSignedBigInt(FIXTURE.liquidityDelta)),
        new ethereum.EventParam('salt', ethereum.Value.fromFixedBytes(FIXTURE.salt)),
      ],
      MOCK_EVENT.receipt,
    )

    // Put the pools tick in range
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.tick = BigInt.fromI32(FIXTURE.tickLower + FIXTURE.tickUpper).div(BigInt.fromI32(2))
    pool.sqrtPrice = TickMath.getSqrtRatioAtTick(pool.tick!.toI32())
    pool.save()

    handleModifyLiquidityHelper(event, TEST_CONFIG)

    // Calculate expected amounts
    const amountToken0 = convertTokenToDecimal(
      BigInt.fromString('295530108791371696809'),
      BigInt.fromString(USDC_MAINNET_FIXTURE.decimals),
    )
    const amountToken1 = convertTokenToDecimal(
      BigInt.fromString('295530108791371696809'),
      BigInt.fromString(WETH_MAINNET_FIXTURE.decimals),
    )

    // Verify LiquidityPosition was created with correct values
    assertObjectMatches('LiquidityPosition', tokenId, [
      ['tokenId', tokenId],
      ['pool', USDC_WETH_POOL_ID],
      ['tickLower', FIXTURE.tickLower.toString()],
      ['tickUpper', FIXTURE.tickUpper.toString()],
      ['liquidity', FIXTURE.liquidityDelta.toString()],
      ['amount0', amountToken0.toString()],
      ['amount1', amountToken1.toString()],
    ])
  })

  test('success - LiquidityPosition accumulates liquidity on multiple add events', () => {
    const kittycornPMAddress = Address.fromString(KITTYCORN_POSITION_MANAGER_ADDRESS)
    const tokenId = '1'
    const liquidityDelta1 = BigInt.fromString('10000000000000000000000')
    const liquidityDelta2 = BigInt.fromString('5000000000000000000000')

    // First add liquidity event
    const event1 = new ModifyLiquidity(
      MOCK_EVENT.address,
      MOCK_EVENT.logIndex,
      MOCK_EVENT.transactionLogIndex,
      MOCK_EVENT.logType,
      MOCK_EVENT.block,
      MOCK_EVENT.transaction,
      [
        new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(id)),
        new ethereum.EventParam('sender', ethereum.Value.fromAddress(kittycornPMAddress)),
        new ethereum.EventParam('tickLower', ethereum.Value.fromI32(-600)),
        new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(600)),
        new ethereum.EventParam('liquidityDelta', ethereum.Value.fromSignedBigInt(liquidityDelta1)),
        new ethereum.EventParam('salt', ethereum.Value.fromFixedBytes(KITTYCORN_SALT)),
      ],
      MOCK_EVENT.receipt,
    )

    // Second add liquidity event
    const event2 = new ModifyLiquidity(
      MOCK_EVENT.address,
      MOCK_EVENT.logIndex,
      MOCK_EVENT.transactionLogIndex,
      MOCK_EVENT.logType,
      MOCK_EVENT.block,
      MOCK_EVENT.transaction,
      [
        new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(id)),
        new ethereum.EventParam('sender', ethereum.Value.fromAddress(kittycornPMAddress)),
        new ethereum.EventParam('tickLower', ethereum.Value.fromI32(-600)),
        new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(600)),
        new ethereum.EventParam('liquidityDelta', ethereum.Value.fromSignedBigInt(liquidityDelta2)),
        new ethereum.EventParam('salt', ethereum.Value.fromFixedBytes(KITTYCORN_SALT)),
      ],
      MOCK_EVENT.receipt,
    )

    // Put the pools tick in range
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.tick = BigInt.fromI32(0)
    pool.sqrtPrice = TickMath.getSqrtRatioAtTick(pool.tick!.toI32())
    pool.save()

    // Execute both events
    handleModifyLiquidityHelper(event1, TEST_CONFIG)
    handleModifyLiquidityHelper(event2, TEST_CONFIG)

    // Verify liquidity is accumulated
    const expectedLiquidity = liquidityDelta1.plus(liquidityDelta2)
    assertObjectMatches('LiquidityPosition', tokenId, [
      ['liquidity', expectedLiquidity.toString()],
    ])
  })

  test('success - LiquidityPosition decreases on remove liquidity event', () => {
    const kittycornPMAddress = Address.fromString(KITTYCORN_POSITION_MANAGER_ADDRESS)
    const tokenId = '1'
    const liquidityDeltaAdd = BigInt.fromString('10000000000000000000000')
    const liquidityDeltaRemove = BigInt.fromString('-3000000000000000000000')

    // Add liquidity event
    const eventAdd = new ModifyLiquidity(
      MOCK_EVENT.address,
      MOCK_EVENT.logIndex,
      MOCK_EVENT.transactionLogIndex,
      MOCK_EVENT.logType,
      MOCK_EVENT.block,
      MOCK_EVENT.transaction,
      [
        new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(id)),
        new ethereum.EventParam('sender', ethereum.Value.fromAddress(kittycornPMAddress)),
        new ethereum.EventParam('tickLower', ethereum.Value.fromI32(-600)),
        new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(600)),
        new ethereum.EventParam('liquidityDelta', ethereum.Value.fromSignedBigInt(liquidityDeltaAdd)),
        new ethereum.EventParam('salt', ethereum.Value.fromFixedBytes(KITTYCORN_SALT)),
      ],
      MOCK_EVENT.receipt,
    )

    // Remove liquidity event
    const eventRemove = new ModifyLiquidity(
      MOCK_EVENT.address,
      MOCK_EVENT.logIndex,
      MOCK_EVENT.transactionLogIndex,
      MOCK_EVENT.logType,
      MOCK_EVENT.block,
      MOCK_EVENT.transaction,
      [
        new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(id)),
        new ethereum.EventParam('sender', ethereum.Value.fromAddress(kittycornPMAddress)),
        new ethereum.EventParam('tickLower', ethereum.Value.fromI32(-600)),
        new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(600)),
        new ethereum.EventParam('liquidityDelta', ethereum.Value.fromSignedBigInt(liquidityDeltaRemove)),
        new ethereum.EventParam('salt', ethereum.Value.fromFixedBytes(KITTYCORN_SALT)),
      ],
      MOCK_EVENT.receipt,
    )

    // Put the pools tick in range
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.tick = BigInt.fromI32(0)
    pool.sqrtPrice = TickMath.getSqrtRatioAtTick(pool.tick!.toI32())
    pool.save()

    // Execute both events
    handleModifyLiquidityHelper(eventAdd, TEST_CONFIG)
    handleModifyLiquidityHelper(eventRemove, TEST_CONFIG)

    // Verify liquidity decreased
    const expectedLiquidity = liquidityDeltaAdd.plus(liquidityDeltaRemove)
    assertObjectMatches('LiquidityPosition', tokenId, [
      ['liquidity', expectedLiquidity.toString()],
    ])
  })

  test('success - LiquidityPosition not created when sender is not Kittycorn Position Manager', () => {
    const nonKittycornAddress = Address.fromString('0x1111111111111111111111111111111111111111')
    const tokenId = '1'

    const event = new ModifyLiquidity(
      MOCK_EVENT.address,
      MOCK_EVENT.logIndex,
      MOCK_EVENT.transactionLogIndex,
      MOCK_EVENT.logType,
      MOCK_EVENT.block,
      MOCK_EVENT.transaction,
      [
        new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(id)),
        new ethereum.EventParam('sender', ethereum.Value.fromAddress(nonKittycornAddress)),
        new ethereum.EventParam('tickLower', ethereum.Value.fromI32(-600)),
        new ethereum.EventParam('tickUpper', ethereum.Value.fromI32(600)),
        new ethereum.EventParam('liquidityDelta', ethereum.Value.fromSignedBigInt(BigInt.fromString('10000000000000000000000'))),
        new ethereum.EventParam('salt', ethereum.Value.fromFixedBytes(KITTYCORN_SALT)),
      ],
      MOCK_EVENT.receipt,
    )

    // Put the pools tick in range
    const pool = Pool.load(USDC_WETH_POOL_ID)!
    pool.tick = BigInt.fromI32(0)
    pool.sqrtPrice = TickMath.getSqrtRatioAtTick(pool.tick!.toI32())
    pool.save()

    handleModifyLiquidityHelper(event, TEST_CONFIG)

    // Verify LiquidityPosition was NOT created
    const liquidityPosition = LiquidityPosition.load(tokenId)
    assert.assertNull(liquidityPosition)
  })
})
