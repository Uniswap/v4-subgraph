import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { afterEach, assert, beforeEach, clearStore, describe, test } from 'matchstick-as'

import { handleBorrow, handleDisableCollateral, handleEnableCollateral, handleRepay } from '../../src/mappings/bank'
import { handleModifyLiquidityHelper } from '../../src/mappings/modifyLiquidity'
import { Borrow, EnableCollateral, Repay } from '../../src/types/KittycornBank/KittycornBank'
import { ModifyLiquidity } from '../../src/types/PoolManager/PoolManager'
import {
  BorrowAsset,
  Bundle,
  LiquidityPosition,
  Pool,
  Position,
  PositionIdMapping,
  Token,
} from '../../src/types/schema'
import { ZERO_BD, ZERO_BI } from '../../src/utils/constants'
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

// USDT token address (from arbiscan example)
const USDT_ADDRESS = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'

const id = Bytes.fromHexString(USDC_WETH_POOL_ID) as Bytes

function createBorrowEvent(positionId: BigInt, ulToken: Address, borrowAmount: BigInt): Borrow {
  return new Borrow(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('positionId', ethereum.Value.fromUnsignedBigInt(positionId)),
      new ethereum.EventParam('ulToken', ethereum.Value.fromAddress(ulToken)),
      new ethereum.EventParam('borrowAmount', ethereum.Value.fromUnsignedBigInt(borrowAmount)),
    ],
    MOCK_EVENT.receipt,
  )
}

function createRepayEvent(positionId: BigInt, ulToken: Address, repayAmount: BigInt, repayFee: BigInt): Repay {
  return new Repay(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('positionId', ethereum.Value.fromUnsignedBigInt(positionId)),
      new ethereum.EventParam('ulToken', ethereum.Value.fromAddress(ulToken)),
      new ethereum.EventParam('repayAmount', ethereum.Value.fromUnsignedBigInt(repayAmount)),
      new ethereum.EventParam('repayFee', ethereum.Value.fromUnsignedBigInt(repayFee)),
    ],
    MOCK_EVENT.receipt,
  )
}

function setupLiquidityPosition(tokenId: string): void {
  const kittycornPMAddress = Address.fromString(KITTYCORN_POSITION_MANAGER_ADDRESS)
  const salt = Bytes.fromHexString(
    '0x000000000000000000000000000000000000000000000000000000000000000' + tokenId,
  ) as Bytes

  const event = new ModifyLiquidity(
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
      new ethereum.EventParam(
        'liquidityDelta',
        ethereum.Value.fromSignedBigInt(BigInt.fromString('10000000000000000000000')),
      ),
      new ethereum.EventParam('salt', ethereum.Value.fromFixedBytes(salt)),
    ],
    MOCK_EVENT.receipt,
  )

  const pool = Pool.load(USDC_WETH_POOL_ID)!
  pool.tick = BigInt.fromI32(0)
  pool.sqrtPrice = TickMath.getSqrtRatioAtTick(pool.tick!.toI32())
  pool.save()

  handleModifyLiquidityHelper(event, TEST_CONFIG)
}

function setupBorrowAsset(tokenAddress: string): void {
  const borrowAsset = new BorrowAsset(tokenAddress)
  borrowAsset.token = tokenAddress
  borrowAsset.totalSupply = ZERO_BI
  borrowAsset.supplyAPY = ZERO_BI
  borrowAsset.borrowAPY = ZERO_BI
  borrowAsset.allowBorrow = true
  borrowAsset.borrowFee = ZERO_BI
  borrowAsset.totalBorrowAmount = ZERO_BI
  borrowAsset.save()
}

function setupPositionIdMapping(positionId: string, tokenId: string): void {
  const mapping = new PositionIdMapping(positionId)
  mapping.tokenId = tokenId
  mapping.save()
}

function setupUSDTToken(): void {
  const usdtToken = new Token(USDT_ADDRESS)
  usdtToken.symbol = 'USDT'
  usdtToken.name = 'Tether USD'
  usdtToken.address = USDT_ADDRESS
  usdtToken.decimals = BigInt.fromI32(6)
  usdtToken.totalSupply = BigInt.fromI32(1000000000)
  usdtToken.volume = ZERO_BD
  usdtToken.volumeUSD = ZERO_BD
  usdtToken.untrackedVolumeUSD = ZERO_BD
  usdtToken.feesUSD = ZERO_BD
  usdtToken.txCount = ZERO_BI
  usdtToken.poolCount = ZERO_BI
  usdtToken.totalValueLocked = ZERO_BD
  usdtToken.totalValueLockedUSD = ZERO_BD
  usdtToken.totalValueLockedUSDUntracked = ZERO_BD
  usdtToken.derivedETH = TEST_USDC_DERIVED_ETH
  usdtToken.whitelistPools = []
  usdtToken.isKittycornLiquidity = false
  usdtToken.save()
}

describe('handleBorrow', () => {
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

    setupUSDTToken()
    setupBorrowAsset(USDT_ADDRESS)
  })

  afterEach(() => {
    clearStore()
  })

  test('success - handleBorrow sets borrowToken and borrowAmount on LiquidityPosition', () => {
    const positionId = '9'
    const tokenId = '9'

    // Create LiquidityPosition via ModifyLiquidity
    setupLiquidityPosition(tokenId)

    // Create PositionIdMapping (positionId -> tokenId)
    setupPositionIdMapping(positionId, tokenId)

    // Verify initial state - borrowToken is null, borrowAmount is zero
    const initialPosition = LiquidityPosition.load(tokenId)!
    assert.assertNotNull(initialPosition)
    assert.assertNull(initialPosition.borrowToken)
    assert.bigIntEquals(ZERO_BI, initialPosition.borrowAmount)

    // Create Borrow event (1 USDT = 1000000 with 6 decimals)
    const borrowAmount = BigInt.fromString('1000000')
    const borrowEvent = createBorrowEvent(BigInt.fromString(positionId), Address.fromString(USDT_ADDRESS), borrowAmount)

    handleBorrow(borrowEvent)

    // Verify borrowToken references Token entity and borrowAmount is set
    assertObjectMatches('LiquidityPosition', tokenId, [
      ['borrowToken', USDT_ADDRESS],
      ['borrowAmount', borrowAmount.toString()],
    ])
  })

  test('success - handleBorrow accumulates borrowAmount on multiple borrows', () => {
    const positionId = '9'
    const tokenId = '9'

    setupLiquidityPosition(tokenId)
    setupPositionIdMapping(positionId, tokenId)

    // First borrow: 1 USDT
    const borrowAmount1 = BigInt.fromString('1000000')
    const borrowEvent1 = createBorrowEvent(
      BigInt.fromString(positionId),
      Address.fromString(USDT_ADDRESS),
      borrowAmount1,
    )
    handleBorrow(borrowEvent1)

    // Second borrow: 2 USDT
    const borrowAmount2 = BigInt.fromString('2000000')
    const borrowEvent2 = createBorrowEvent(
      BigInt.fromString(positionId),
      Address.fromString(USDT_ADDRESS),
      borrowAmount2,
    )
    handleBorrow(borrowEvent2)

    // Verify borrowAmount is accumulated
    const expectedTotal = borrowAmount1.plus(borrowAmount2)
    assertObjectMatches('LiquidityPosition', tokenId, [
      ['borrowToken', USDT_ADDRESS],
      ['borrowAmount', expectedTotal.toString()],
    ])
  })

  test('success - handleBorrow updates BorrowAsset totalBorrowAmount', () => {
    const positionId = '9'
    const tokenId = '9'

    setupLiquidityPosition(tokenId)
    setupPositionIdMapping(positionId, tokenId)

    const borrowAmount = BigInt.fromString('1000000')
    const borrowEvent = createBorrowEvent(BigInt.fromString(positionId), Address.fromString(USDT_ADDRESS), borrowAmount)
    handleBorrow(borrowEvent)

    assertObjectMatches('BorrowAsset', USDT_ADDRESS, [['totalBorrowAmount', borrowAmount.toString()]])
  })

  test('success - handleBorrow does nothing if PositionIdMapping does not exist', () => {
    const positionId = '999'

    const borrowAmount = BigInt.fromString('1000000')
    const borrowEvent = createBorrowEvent(BigInt.fromString(positionId), Address.fromString(USDT_ADDRESS), borrowAmount)

    handleBorrow(borrowEvent)

    // No mapping exists, so no LiquidityPosition should be updated
    const position = LiquidityPosition.load(positionId)
    assert.assertNull(position)
  })
})

describe('handleRepay', () => {
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

    setupUSDTToken()
    setupBorrowAsset(USDT_ADDRESS)
  })

  afterEach(() => {
    clearStore()
  })

  test('success - handleRepay decreases borrowAmount on LiquidityPosition', () => {
    const positionId = '9'
    const tokenId = '9'

    setupLiquidityPosition(tokenId)
    setupPositionIdMapping(positionId, tokenId)

    // Borrow 5 USDT
    const borrowAmount = BigInt.fromString('5000000')
    const borrowEvent = createBorrowEvent(BigInt.fromString(positionId), Address.fromString(USDT_ADDRESS), borrowAmount)
    handleBorrow(borrowEvent)

    // Repay 2 USDT
    const repayAmount = BigInt.fromString('2000000')
    const repayFee = BigInt.fromString('1000')
    const repayEvent = createRepayEvent(
      BigInt.fromString(positionId),
      Address.fromString(USDT_ADDRESS),
      repayAmount,
      repayFee,
    )
    handleRepay(repayEvent)

    const expectedRemaining = borrowAmount.minus(repayAmount)
    assertObjectMatches('LiquidityPosition', tokenId, [['borrowAmount', expectedRemaining.toString()]])
  })

  test('success - handleRepay decreases BorrowAsset totalBorrowAmount', () => {
    const positionId = '9'
    const tokenId = '9'

    setupLiquidityPosition(tokenId)
    setupPositionIdMapping(positionId, tokenId)

    // Borrow 5 USDT
    const borrowAmount = BigInt.fromString('5000000')
    const borrowEvent = createBorrowEvent(BigInt.fromString(positionId), Address.fromString(USDT_ADDRESS), borrowAmount)
    handleBorrow(borrowEvent)

    // Repay 2 USDT
    const repayAmount = BigInt.fromString('2000000')
    const repayFee = BigInt.fromString('1000')
    const repayEvent = createRepayEvent(
      BigInt.fromString(positionId),
      Address.fromString(USDT_ADDRESS),
      repayAmount,
      repayFee,
    )
    handleRepay(repayEvent)

    const expectedRemaining = borrowAmount.minus(repayAmount)
    assertObjectMatches('BorrowAsset', USDT_ADDRESS, [['totalBorrowAmount', expectedRemaining.toString()]])
  })

  test('success - handleRepay to zero clears borrowAmount', () => {
    const positionId = '9'
    const tokenId = '9'

    setupLiquidityPosition(tokenId)
    setupPositionIdMapping(positionId, tokenId)

    // Borrow 1 USDT
    const borrowAmount = BigInt.fromString('1000000')
    const borrowEvent = createBorrowEvent(BigInt.fromString(positionId), Address.fromString(USDT_ADDRESS), borrowAmount)
    handleBorrow(borrowEvent)

    // Repay full amount
    const repayFee = BigInt.fromString('1000')
    const repayEvent = createRepayEvent(
      BigInt.fromString(positionId),
      Address.fromString(USDT_ADDRESS),
      borrowAmount,
      repayFee,
    )
    handleRepay(repayEvent)

    assertObjectMatches('LiquidityPosition', tokenId, [['borrowAmount', '0']])
  })

  // Test with real data from arbiscan tx:
  // Borrow: https://arbiscan.io/tx/0x85952bb24c2a5339c919b3bcbb168d73e9cf5a2340434def56dd6b3ef2dd7907#eventlog
  // Repay: https://arbiscan.io/tx/0x9b86ae8dd30b3fe592af833621f288a8aa2d0498ecfc782f5b6d9d776ae5e744#eventlog
  test('success - handleRepay clamps to zero when repayAmount exceeds borrowAmount (real arbiscan data)', () => {
    const positionId = '9'
    const tokenId = '9'

    setupLiquidityPosition(tokenId)
    setupPositionIdMapping(positionId, tokenId)

    // Real Borrow event data: positionId=9, ulToken=USDT, borrowAmount=1000000
    const borrowAmount = BigInt.fromString('1000000')
    const borrowEvent = createBorrowEvent(BigInt.fromString(positionId), Address.fromString(USDT_ADDRESS), borrowAmount)
    handleBorrow(borrowEvent)

    // Verify after borrow
    assertObjectMatches('LiquidityPosition', tokenId, [
      ['borrowToken', USDT_ADDRESS],
      ['borrowAmount', '1000000'],
    ])

    // Real Repay event data: positionId=9, ulToken=USDT, repayAmount=1000012, repayFee=4
    // repayAmount (1000012) > borrowAmount (1000000) due to accrued interest
    const repayAmount = BigInt.fromString('1000012')
    const repayFee = BigInt.fromString('4')
    const repayEvent = createRepayEvent(
      BigInt.fromString(positionId),
      Address.fromString(USDT_ADDRESS),
      repayAmount,
      repayFee,
    )
    handleRepay(repayEvent)

    // borrowAmount should be clamped to 0 (not negative -12)
    assertObjectMatches('LiquidityPosition', tokenId, [['borrowAmount', '0']])
  })
})

function createEnableCollateralEvent(positionId: BigInt, tokenId: BigInt, owner: Address): EnableCollateral {
  return new EnableCollateral(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('positionId', ethereum.Value.fromUnsignedBigInt(positionId)),
      new ethereum.EventParam('tokenId', ethereum.Value.fromUnsignedBigInt(tokenId)),
      new ethereum.EventParam('owner', ethereum.Value.fromAddress(owner)),
    ],
    MOCK_EVENT.receipt,
  )
}

function setupPosition(tokenId: string): void {
  const position = new Position(tokenId)
  position.tokenId = BigInt.fromString(tokenId)
  position.owner = '0x1234567890123456789012345678901234567890'
  position.origin = '0x1234567890123456789012345678901234567890'
  position.createdAtTimestamp = ZERO_BI
  position.isLiquidated = false
  position.isCollateral = false
  position.isMigrated = false
  position.save()
}

describe('handleEnableCollateral', () => {
  beforeEach(() => {
    invokePoolCreatedWithMockedEthCalls(MOCK_EVENT, TEST_CONFIG)
  })

  afterEach(() => {
    clearStore()
  })

  test('success - creates PositionIdMapping when collateral is enabled', () => {
    const positionId = '11'
    const tokenId = '78'

    setupPosition(tokenId)

    const event = createEnableCollateralEvent(
      BigInt.fromString(positionId),
      BigInt.fromString(tokenId),
      Address.fromString('0x1234567890123456789012345678901234567890'),
    )
    handleEnableCollateral(event)

    // Verify PositionIdMapping is created
    const mapping = PositionIdMapping.load(positionId)
    assert.assertNotNull(mapping)
    assert.stringEquals(tokenId, mapping!.tokenId)

    // Verify Position.isCollateral is set to true
    const position = Position.load(tokenId)
    assert.assertTrue(position!.isCollateral)
  })

  test('success - updates existing PositionIdMapping', () => {
    const positionId = '11'
    const tokenId = '78'

    setupPosition(tokenId)

    // Create initial mapping
    const initialMapping = new PositionIdMapping(positionId)
    initialMapping.tokenId = '999' // different tokenId
    initialMapping.save()

    const event = createEnableCollateralEvent(
      BigInt.fromString(positionId),
      BigInt.fromString(tokenId),
      Address.fromString('0x1234567890123456789012345678901234567890'),
    )
    handleEnableCollateral(event)

    // Verify PositionIdMapping is updated
    const mapping = PositionIdMapping.load(positionId)
    assert.assertNotNull(mapping)
    assert.stringEquals(tokenId, mapping!.tokenId)
  })
})

describe('handleDisableCollateral', () => {
  beforeEach(() => {
    invokePoolCreatedWithMockedEthCalls(MOCK_EVENT, TEST_CONFIG)
  })

  afterEach(() => {
    clearStore()
  })

  test('success - removes PositionIdMapping when collateral is disabled', () => {
    const positionId = '11'
    const tokenId = '78'

    setupPosition(tokenId)

    // First enable collateral
    const enableEvent = createEnableCollateralEvent(
      BigInt.fromString(positionId),
      BigInt.fromString(tokenId),
      Address.fromString('0x1234567890123456789012345678901234567890'),
    )
    handleEnableCollateral(enableEvent)

    // Verify mapping exists
    let mapping = PositionIdMapping.load(positionId)
    assert.assertNotNull(mapping)

    // Now disable collateral
    const disableEvent = createEnableCollateralEvent(
      BigInt.fromString(positionId),
      BigInt.fromString(tokenId),
      Address.fromString('0x1234567890123456789012345678901234567890'),
    )
    handleDisableCollateral(disableEvent)

    // Verify PositionIdMapping is removed
    mapping = PositionIdMapping.load(positionId)
    assert.assertNull(mapping)

    // Verify Position.isCollateral is set to false
    const position = Position.load(tokenId)
    assert.assertTrue(!position!.isCollateral)
  })

  test('success - handles DisableCollateral when no mapping exists', () => {
    const positionId = '11'
    const tokenId = '78'

    setupPosition(tokenId)

    // Set position as collateral without creating mapping (edge case)
    const position = Position.load(tokenId)!
    position.isCollateral = true
    position.save()

    const event = createEnableCollateralEvent(
      BigInt.fromString(positionId),
      BigInt.fromString(tokenId),
      Address.fromString('0x1234567890123456789012345678901234567890'),
    )
    handleDisableCollateral(event)

    // Verify Position.isCollateral is set to false
    const updatedPosition = Position.load(tokenId)
    assert.assertTrue(!updatedPosition!.isCollateral)
  })
})
