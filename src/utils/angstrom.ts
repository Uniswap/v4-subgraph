import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { decode_bundle, PoolReward, Transaction } from '@sorellalabs/angstrom-assembly-helper'

import { Bundle, Pool, Token } from '../types/schema'
import { convertTokenToDecimal, hexToBigInt } from '.'
import { ZERO_BD } from './constants'

export class AngstromBundleResult {
  amount0: BigDecimal
  amount1: BigDecimal
  feesUSD: BigDecimal
  found: boolean

  constructor(amount0: BigDecimal, amount1: BigDecimal, feesUSD: BigDecimal, found: boolean) {
    this.amount0 = amount0
    this.amount1 = amount1
    this.feesUSD = feesUSD
    this.found = found
  }
}

export function processAngstromBundle(
  transactionInput: string,
  pool: Pool,
  token0: Token,
  token1: Token,
  blockTimestamp: BigInt,
): AngstromBundleResult {
  log.debug('processAngstromBundle: decoding bundle for pool {}', [pool.id])
  const bundle = decode_bundle(transactionInput)
  log.debug('processAngstromBundle: decoded bundle, txn count: {}, reward count: {}', [
    bundle.transactions.length.toString(),
    bundle.rewards.length.toString(),
  ])

  // Process transactions to find matching swap amounts
  let swapResult: AngstromBundleResult | null = null
  const transactions = bundle.transactions
  for (let i = 0; i < transactions.length; i++) {
    const result = processTransaction(transactions[i], pool, token0, token1)
    if (result.found) {
      swapResult = result
      break
    }
  }

  // Process rewards for fee tracking and calculate total fees
  let totalFeesUSD = ZERO_BD
  const rewards = bundle.rewards
  for (let i = 0; i < rewards.length; i++) {
    const rewardFeeUSD = processReward(rewards[i], blockTimestamp, pool)
    totalFeesUSD = totalFeesUSD.plus(rewardFeeUSD)
  }

  if (swapResult !== null) {
    return new AngstromBundleResult(swapResult.amount0, swapResult.amount1, totalFeesUSD, true)
  } else {
    log.debug('processAngstromBundle: no matching transaction found for pool {}', [pool.id])
    return new AngstromBundleResult(ZERO_BD, ZERO_BD, totalFeesUSD, false)
  }
}

function processTransaction(transaction: Transaction, _pool: Pool, token0: Token, token1: Token): AngstromBundleResult {
  // Check if this transaction matches our pool's token pair
  const transactionToken0 = transaction.token0.toLowerCase()
  const transactionToken1 = transaction.token1.toLowerCase()
  const poolToken0 = token0.id.toLowerCase()
  const poolToken1 = token1.id.toLowerCase()

  if (transactionToken0 == poolToken0 && transactionToken1 == poolToken1) {
    log.debug('processTransaction: found matching transaction for tokens {} and {}', [poolToken0, poolToken1])

    const dummyBundleFee = BigInt.fromI32(0) // for now using 0 as bundle fee
    const parsedTransaction = parseTransaction(transaction, dummyBundleFee)

    // Convert amounts to decimals and apply sign correction
    const amount0 = convertTokenToDecimal(parsedTransaction.token0Amount, token0.decimals).times(
      BigDecimal.fromString('-1'),
    )
    const amount1 = convertTokenToDecimal(parsedTransaction.token1Amount, token1.decimals).times(
      BigDecimal.fromString('-1'),
    )

    return new AngstromBundleResult(amount0, amount1, ZERO_BD, true)
  }

  return new AngstromBundleResult(ZERO_BD, ZERO_BD, ZERO_BD, false)
}

function processReward(reward: PoolReward, _blockTimestamp: BigInt, contextPool: Pool): BigDecimal {
  // Find tokens from reward
  const token0 = Token.load(reward.token0.toLowerCase())
  const token1 = Token.load(reward.token1.toLowerCase())

  if (token0 === null || token1 === null) {
    log.debug('processReward: token not found - token0: {} token1: {}', [reward.token0, reward.token1])
    return ZERO_BD
  }

  // Check if this reward matches the current pool's tokens
  const contextToken0 = Token.load(contextPool.token0)
  const contextToken1 = Token.load(contextPool.token1)

  if (contextToken0 === null || contextToken1 === null) {
    log.debug('processReward: context pool tokens not found', [])
    return ZERO_BD
  }

  const rewardToken0 = reward.token0.toLowerCase()
  const rewardToken1 = reward.token1.toLowerCase()
  const poolToken0 = contextToken0.id.toLowerCase()
  const poolToken1 = contextToken1.id.toLowerCase()

  // Only process rewards that match the current pool's token pair
  const isMatchingPool = rewardToken0 == poolToken0 && rewardToken1 == poolToken1

  if (!isMatchingPool) {
    log.debug('processReward: reward tokens {} {} do not match pool tokens {} {}', [
      rewardToken0,
      rewardToken1,
      poolToken0,
      poolToken1,
    ])
    return ZERO_BD
  }

  // Calculate total reward amount
  let aggregatedRewardAmount = BigInt.zero()
  for (let i = 0; i < reward.rewards.length; i++) {
    aggregatedRewardAmount = aggregatedRewardAmount.plus(hexToBigInt(reward.rewards[i]))
  }

  if (aggregatedRewardAmount.equals(BigInt.zero())) {
    return ZERO_BD
  }

  // Convert to token0 decimals (assuming rewards are in token0 for now)
  const rewardAmount = convertTokenToDecimal(aggregatedRewardAmount, token0.decimals)
  const bundle = Bundle.load('1')!
  const feeUSD = rewardAmount.times(token0.derivedETH).times(bundle.ethPriceUSD)

  log.debug('processReward: processed fee of {} USD for tokens {} and {}', [feeUSD.toString(), token0.id, token1.id])
  return feeUSD
}

class ParsedTransaction {
  token0: string
  token0Amount: BigInt
  token1: string
  token1Amount: BigInt
  origin: string
  sqrtPriceX96: BigInt
  tick: BigInt

  constructor(
    token0: string,
    token0Amount: BigInt,
    token1: string,
    token1Amount: BigInt,
    origin: string,
    sqrtPriceX96: BigInt,
    tick: BigInt,
  ) {
    this.token0 = token0
    this.token0Amount = token0Amount
    this.token1 = token1
    this.token1Amount = token1Amount
    this.origin = origin
    this.sqrtPriceX96 = sqrtPriceX96
    this.tick = tick
  }
}

function parseTransaction(transaction: Transaction, bundleFee: BigInt): ParsedTransaction {
  const zeroForOne = transaction.zeroForOne
  const exactIn = transaction.exactIn
  const gasUsedAsset0 = hexToBigInt(transaction.gasUsedAsset0)
  const bundleFeeBigInt = BigInt.fromI32(1000000).minus(bundleFee)
  const price_1over0 = hexToBigInt(transaction.price_1over0)
  const token0 = transaction.token0
  let token0Amount = hexToBigInt(transaction.token0Amount)
  const token1 = transaction.token1
  let token1Amount = hexToBigInt(transaction.token1Amount)
  const origin = transaction.origin
  const sqrtPriceX96 = price_1over0
    .times(BigInt.fromI32(2).pow(96))
    .div(BigInt.fromI32(10).pow(27))
    .sqrt()
  const tick = BigInt.fromI32(0)

  if (token0Amount.equals(BigInt.zero())) {
    const token0WithoutGas = token1Amount
      .times(bundleFeeBigInt)
      .div(BigInt.fromI32(1000000))
      .times(BigInt.fromI32(10).pow(27))
      .div(price_1over0)
    if (exactIn) {
      token0Amount = token0WithoutGas.minus(gasUsedAsset0)
    } else {
      token0Amount = token0WithoutGas.plus(gasUsedAsset0)
    }
  } else if (token1Amount.equals(BigInt.zero())) {
    const price = price_1over0.times(bundleFeeBigInt).div(BigInt.fromI32(1000000))
    let token0AfterGas: BigInt
    if (exactIn) {
      token0AfterGas = token0Amount.minus(gasUsedAsset0)
    } else {
      token0AfterGas = token0Amount.plus(gasUsedAsset0)
    }
    token1Amount = token0AfterGas.times(price).div(BigInt.fromI32(10).pow(27))
  } else {
    token0Amount = token0Amount.minus(gasUsedAsset0)
  }

  return new ParsedTransaction(
    token0,
    zeroForOne ? token0Amount : token0Amount.neg(),
    token1,
    zeroForOne ? token1Amount.neg() : token1Amount,
    origin,
    sqrtPriceX96,
    tick,
  )
}
