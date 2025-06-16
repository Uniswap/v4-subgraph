import { BigDecimal, log } from '@graphprotocol/graph-ts'

import {
  DisableCollateral,
  EnableCollateral,
  LiquidatePosition as LiquidatePositionEvent,
  SetConfigBorrowToken as SetConfigBorrowTokenEvent,
  SetConfigCollateral as SetConfigCollateralCallEvent,
} from '../types/KittycornBank/KittycornBank'
import {
  BorrowAsset,
  LiquidatePosition,
  LiquidatePositionDaily,
  LiquidityPosition,
  Pool,
  PoolAllowCollateral,
  Position,
  Token,
} from '../types/schema'
import { exponentToBigDecimal, loadKittycornPositionManager } from '../utils'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ONE_BI, ZERO_BD, ZERO_BI } from '../utils/constants'
import { updateKittycornDayData } from '../utils/intervalUpdates'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from '../utils/token'

export function handleConfigBorrowToken(event: SetConfigBorrowTokenEvent): void {
  handleConfigBorrowTokenHelper(event)
}

export function handleLiquidatePosition(event: LiquidatePositionEvent): void {
  handleLiquidatePositionHelper(event)
}

export function handleSetConfigCollateral(event: SetConfigCollateralCallEvent): void {
  handleSetConfigCollateralHelper(event)
}

export function handleEnableCollateral(event: EnableCollateral): void {
  handleCollateralEnableDisable(event, true)
}

export function handleDisableCollateral(event: DisableCollateral): void {
  handleCollateralEnableDisable(event, false)
}

function handleCollateralEnableDisable(event: EnableCollateral, isCollateral: boolean): void {
  const tokenId = event.params.tokenId.toString()
  const position = Position.load(tokenId)
  if (position === null) {
    log.error('handleCollateralEnableDisable: position not found for tokenId {}', [tokenId])
    return
  }
  position.isCollateral = isCollateral
  position.save()
}

function handleSetConfigCollateralHelper(
  event: SetConfigCollateralCallEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const kittycornPositionManagerAddress = subgraphConfig.kittycornPositionManagerAddress
  const poolId = event.params.poolId.toHexString()
  let poolCollateral = PoolAllowCollateral.load(poolId)
  const kittycornPositionManager = loadKittycornPositionManager(kittycornPositionManagerAddress)
  const pool = Pool.load(poolId)
  if (poolCollateral !== null) {
    kittycornPositionManager.poolCount = kittycornPositionManager.poolCount.plus(ONE_BI)
    poolCollateral = new PoolAllowCollateral(poolId)
  }
  if (pool !== null) {
    poolCollateral.pool = pool.id
    poolCollateral.allowCollateral = event.params.allowCollateral
    poolCollateral.maxLTV = event.params.maxLTV
    poolCollateral.liquidationThreshold = event.params.liquidationThreshold
    poolCollateral.liquidationFee = event.params.liquidationFee
    poolCollateral.save()
  }
}

export function handleConfigBorrowTokenHelper(
  event: SetConfigBorrowTokenEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const assetId = event.params.ulToken.toHexString()
  const allowBorrow = event.params.allowBorrow
  const borrowFee = event.params.borrowFee

  const tokenOverrides = subgraphConfig.tokenOverrides
  const nativeTokenDetails = subgraphConfig.nativeTokenDetails
  const kittycornPositionManagerAddress = subgraphConfig.kittycornPositionManagerAddress

  let token = Token.load(assetId)

  // fetch info if null
  if (token === null) {
    token = new Token(assetId)
    token.symbol = fetchTokenSymbol(event.params.ulToken, tokenOverrides, nativeTokenDetails)
    token.name = fetchTokenName(event.params.ulToken, tokenOverrides, nativeTokenDetails)
    token.totalSupply = fetchTokenTotalSupply(event.params.ulToken)
    const decimals = fetchTokenDecimals(event.params.ulToken, tokenOverrides, nativeTokenDetails)

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug('mybug the decimal on token was null', [])
      return
    }

    token.decimals = decimals
    token.derivedETH = ZERO_BD
    token.volume = ZERO_BD
    token.volumeUSD = ZERO_BD
    token.feesUSD = ZERO_BD
    token.untrackedVolumeUSD = ZERO_BD
    token.totalValueLocked = ZERO_BD
    token.totalValueLockedUSD = ZERO_BD
    token.totalValueLockedUSDUntracked = ZERO_BD
    token.txCount = ZERO_BI
    token.poolCount = ZERO_BI
    token.whitelistPools = []
  }

  const kittycornDayData = updateKittycornDayData(event, kittycornPositionManagerAddress)
  let borrowAsset = BorrowAsset.load(assetId)
  if (borrowAsset === null) {
    borrowAsset = new BorrowAsset(assetId)
    borrowAsset.token = token.id
    borrowAsset.totalSupply = ZERO_BI
    borrowAsset.supplyAPY = ZERO_BI
    borrowAsset.borrowAPY = ZERO_BI
    borrowAsset.borrowFee = ZERO_BI
  }
  borrowAsset.allowBorrow = allowBorrow
  borrowAsset.borrowFee = borrowFee
  kittycornDayData.borrowFeesUSD = kittycornDayData.borrowFeesUSD.plus(BigDecimal.fromString(borrowFee.toString()))

  kittycornDayData.save()
  token.save()
  borrowAsset.save()
}

export function handleLiquidatePositionHelper(
  event: LiquidatePositionEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  // concat tokenId and positionId
  const tokenId = event.params.tokenId.toString()
  const positionId = event.params.positionId.toString()

  const liquidityPosition = LiquidityPosition.load(tokenId)
  const position = Position.load(tokenId)

  if (position === null) {
    log.error('handleLiquidatePositionHelper: position not found for tokenId {}', [tokenId])
    return
  }

  if (liquidityPosition === null) {
    log.error('handleLiquidatePositionHelper: liquidityPosition not found for tokenId {}', [tokenId])
    return
  }

  const pool = Pool.load(liquidityPosition.pool)
  if (pool === null) {
    log.error('handleLiquidatePositionHelper: pool not found for poolId {}', [liquidityPosition.pool])
    return
  }

  const kittycornPositionManagerAddress = subgraphConfig.kittycornPositionManagerAddress
  const kittycornDayData = updateKittycornDayData(event, kittycornPositionManagerAddress)

  let repayToken = Token.load(event.params.repayToken.toHexString())
  if (repayToken === null) {
    repayToken = new Token(event.params.repayToken.toHexString())
    repayToken.symbol = fetchTokenSymbol(
      event.params.repayToken,
      subgraphConfig.tokenOverrides,
      subgraphConfig.nativeTokenDetails,
    )
    repayToken.name = fetchTokenName(
      event.params.repayToken,
      subgraphConfig.tokenOverrides,
      subgraphConfig.nativeTokenDetails,
    )
    repayToken.totalSupply = fetchTokenTotalSupply(event.params.repayToken)
    const decimals = fetchTokenDecimals(
      event.params.repayToken,
      subgraphConfig.tokenOverrides,
      subgraphConfig.nativeTokenDetails,
    )

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug('mybug the decimal on repay token was null', [])
      return
    }

    repayToken.decimals = decimals
    repayToken.derivedETH = ZERO_BD
    repayToken.volume = ZERO_BD
    repayToken.volumeUSD = ZERO_BD
    repayToken.feesUSD = ZERO_BD
    repayToken.untrackedVolumeUSD = ZERO_BD
    repayToken.totalValueLocked = ZERO_BD
    repayToken.totalValueLockedUSD = ZERO_BD
    repayToken.totalValueLockedUSDUntracked = ZERO_BD
    repayToken.txCount = ZERO_BI
    repayToken.poolCount = ZERO_BI
    repayToken.whitelistPools = []
  }

  // load token0 and token1
  const token0 = Token.load(pool.token0)
  const token1 = Token.load(pool.token1)

  if (token0 === null || token1 === null || repayToken === null) {
    log.error('handleLiquidatePositionHelper: token0 or token1 not found for poolId {}', [liquidityPosition.pool])
    return
  }

  const id = tokenId + '-' + positionId

  const decimalsToken = fetchTokenDecimals(
    event.params.repayToken,
    subgraphConfig.tokenOverrides,
    subgraphConfig.nativeTokenDetails,
  )
  // bail if we couldn't figure out the decimals
  if (decimalsToken === null) {
    log.debug('mybug the decimal on token was null', [])
    return
  }

  // calculating repayValue with bigdecimal
  const repayValue = event.params.liquidateRepayAmount
    .toBigDecimal()
    .times(event.params.liquidatePrice.toBigDecimal())
    .div(exponentToBigDecimal(decimalsToken))

  const liqPosition = new LiquidatePosition(id)
  liqPosition.tokenId = event.params.tokenId
  liqPosition.positionId = event.params.positionId
  liqPosition.owner = event.params.owner.toHexString()
  liqPosition.liquidator = event.transaction.from.toHexString()
  liqPosition.repayToken = repayToken.id
  liqPosition.liquidatePrice = event.params.liquidatePrice
  liqPosition.positionValue = event.params.positionValue
  liqPosition.repayValue = repayValue
  liqPosition.liquidateFeeValue = event.params.liquidateFeeValue
  liqPosition.protocolFee = event.params.protocolFee
  liqPosition.txHash = event.transaction.hash.toHexString()
  liqPosition.timestamp = event.block.timestamp
  liqPosition.token0 = token0.id
  liqPosition.token1 = token1.id
  liqPosition.feeTier = pool.feeTier
  liqPosition.tickSpacing = pool.tickSpacing
  liqPosition.hooks = pool.hooks
  liqPosition.tickLower = liquidityPosition.tickLower
  liqPosition.tickUpper = liquidityPosition.tickUpper
  liqPosition.sqrtPrice = pool.sqrtPrice
  liqPosition.tick = ZERO_BI
  liqPosition.poolId = pool.id
  liqPosition.position = position.id

  position.isLiquidated = true
  position.liquidatedOwner = event.params.owner.toHexString()

  kittycornDayData.liquidateFeesUSD = kittycornDayData.liquidateFeesUSD.plus(
    BigDecimal.fromString(event.params.liquidateFeeValue.toString()),
  )

  const timestamp = event.block.timestamp.toI32()

  const dayID = timestamp / 86400 // rounded
  const dayStartTimestamp = dayID * 86400

  let positionDaily = LiquidatePositionDaily.load(dayStartTimestamp.toString())
  if (positionDaily === null) {
    positionDaily = new LiquidatePositionDaily(dayStartTimestamp.toString())
    positionDaily.totalCount = ZERO_BI
    positionDaily.liquidateValueAccumulate = ZERO_BI
    positionDaily.liquidateFeeValueAccumulate = ZERO_BI
    positionDaily.protocolFeeAccumulate = ZERO_BI
  }
  positionDaily.totalCount = positionDaily.totalCount.plus(ONE_BI)
  positionDaily.liquidateValueAccumulate = positionDaily.liquidateValueAccumulate.plus(liqPosition.positionValue)
  positionDaily.liquidateFeeValueAccumulate = positionDaily.liquidateFeeValueAccumulate.plus(
    liqPosition.liquidateFeeValue,
  )
  positionDaily.protocolFeeAccumulate = positionDaily.protocolFeeAccumulate.plus(liqPosition.protocolFee)

  position.save()
  kittycornDayData.save()
  liqPosition.save()
  positionDaily.save()
  repayToken.save()
}
