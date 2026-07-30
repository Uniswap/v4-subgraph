import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import { exponentToBigDecimal, safeDiv } from '../utils/index'
import { Bundle, Pool, Token } from './../types/schema'
import { ADDRESS_ZERO, ONE_BD, ZERO_BD, ZERO_BI } from './constants'
import { NativeTokenDetails } from './nativeTokenDetails'

const Q192 = BigInt.fromI32(2).pow(192 as u8)

const PRICING_POOL_RESCAN_INTERVAL_SECONDS = BigInt.fromI32(86400)

export function sqrtPriceX96ToTokenPrices(
  sqrtPriceX96: BigInt,
  token0: Token,
  token1: Token,
  nativeTokenDetails: NativeTokenDetails,
): BigDecimal[] {
  const token0Decimals = token0.id == ADDRESS_ZERO ? nativeTokenDetails.decimals : token0.decimals
  const token1Decimals = token1.id == ADDRESS_ZERO ? nativeTokenDetails.decimals : token1.decimals

  const num = sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()
  const denom = BigDecimal.fromString(Q192.toString())
  const price1 = num
    .div(denom)
    .times(exponentToBigDecimal(token0Decimals))
    .div(exponentToBigDecimal(token1Decimals))

  const price0 = safeDiv(BigDecimal.fromString('1'), price1)
  return [price0, price1]
}

export function getNativePriceInUSD(
  stablecoinWrappedNativePoolId: string,
  stablecoinIsToken0: boolean,
  loadedPool: Pool | null = null,
): BigDecimal {
  // On chains where the native/reference token is itself a USD stablecoin (e.g. Arc, whose native
  // gas token is USDC and which has no wrapped-native / reference-stable pool), the native price is
  // 1 by definition. Such chains opt in by setting stablecoinWrappedNativePoolId to '' (empty).
  if (stablecoinWrappedNativePoolId == '') {
    return ONE_BD
  }
  const stablecoinWrappedNativePool =
    loadedPool !== null && loadedPool.id == stablecoinWrappedNativePoolId
      ? loadedPool
      : Pool.load(stablecoinWrappedNativePoolId)
  if (stablecoinWrappedNativePool !== null) {
    return stablecoinIsToken0 ? stablecoinWrappedNativePool.token0Price : stablecoinWrappedNativePool.token1Price
  } else {
    return ZERO_BD
  }
}

function getPoolNativeLiquidityAndPrice(token: Token, pool: Pool, loadedReferenceToken: Token | null): BigDecimal[] {
  if (!pool.liquidity.gt(ZERO_BI)) {
    return [ZERO_BD, ZERO_BD]
  }

  let referenceToken = loadedReferenceToken
  if (pool.token0 == token.id) {
    if (referenceToken === null || referenceToken.id != pool.token1) {
      referenceToken = Token.load(pool.token1)
    }
    if (referenceToken) {
      return [
        pool.totalValueLockedToken1.times(referenceToken.derivedETH),
        pool.token1Price.times(referenceToken.derivedETH),
      ]
    }
  } else if (pool.token1 == token.id) {
    if (referenceToken === null || referenceToken.id != pool.token0) {
      referenceToken = Token.load(pool.token0)
    }
    if (referenceToken) {
      return [
        pool.totalValueLockedToken0.times(referenceToken.derivedETH),
        pool.token0Price.times(referenceToken.derivedETH),
      ]
    }
  }

  return [ZERO_BD, ZERO_BD]
}

/**
 * Search through graph to find derived Eth per token.
 * Callers pass the already-loaded Bundle to avoid a redundant store.get.
 * The best pool is cached on Token and compared with the active pool on each
 * call. A periodic full scan repairs stale cache entries and seeds grafted
 * tokens without assuming whitelistPools creation order reflects liquidity.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findNativePerToken(
  token: Token,
  wrappedNativeAddress: string,
  stablecoinAddresses: string[],
  minimumNativeLocked: BigDecimal,
  bundle: Bundle,
  timestamp: BigInt,
  activePool: Pool | null,
  activeReferenceToken: Token | null,
): BigDecimal {
  if (token.id == wrappedNativeAddress || token.id == ADDRESS_ZERO) {
    return ONE_BD
  }
  // hardcoded fix for incorrect rates
  // if whitelist includes token - get the safe price
  if (stablecoinAddresses.includes(token.id)) {
    return safeDiv(ONE_BD, bundle.ethPriceUSD)
  }

  const whiteList = token.whitelistPools
  const cachedPoolId = token.pricingPool
  const lastScanTimestamp = token.pricingPoolLastScanTimestamp
  let shouldRescan =
    lastScanTimestamp === null || timestamp.minus(lastScanTimestamp).ge(PRICING_POOL_RESCAN_INTERVAL_SECONDS)
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD
  let bestPoolId: string | null = null

  if (!shouldRescan && cachedPoolId !== null) {
    const cachedPool = activePool !== null && activePool.id == cachedPoolId ? activePool : Pool.load(cachedPoolId)
    if (cachedPool !== null) {
      const loadedReferenceToken = activePool !== null && activePool.id == cachedPoolId ? activeReferenceToken : null
      const cachedValues = getPoolNativeLiquidityAndPrice(token, cachedPool, loadedReferenceToken)
      if (cachedValues[0].gt(minimumNativeLocked)) {
        largestLiquidityETH = cachedValues[0]
        priceSoFar = cachedValues[1]
        bestPoolId = cachedPool.id
      } else {
        shouldRescan = true
      }
    } else {
      shouldRescan = true
    }
  }

  if (shouldRescan) {
    largestLiquidityETH = ZERO_BD
    priceSoFar = ZERO_BD
    bestPoolId = null

    for (let i = 0; i < whiteList.length; ++i) {
      const poolAddress = whiteList[i]
      const pool = activePool !== null && activePool.id == poolAddress ? activePool : Pool.load(poolAddress)
      if (pool !== null) {
        const loadedReferenceToken = activePool !== null && activePool.id == poolAddress ? activeReferenceToken : null
        const values = getPoolNativeLiquidityAndPrice(token, pool, loadedReferenceToken)
        if (values[0].gt(largestLiquidityETH) && values[0].gt(minimumNativeLocked)) {
          largestLiquidityETH = values[0]
          priceSoFar = values[1]
          bestPoolId = pool.id
        }
      }
    }
    token.pricingPoolLastScanTimestamp = timestamp
  } else if (
    activePool !== null &&
    (cachedPoolId === null || activePool.id != cachedPoolId) &&
    whiteList.includes(activePool.id)
  ) {
    const values = getPoolNativeLiquidityAndPrice(token, activePool, activeReferenceToken)
    if (values[0].gt(largestLiquidityETH) && values[0].gt(minimumNativeLocked)) {
      priceSoFar = values[1]
      bestPoolId = activePool.id
    }
  }

  token.pricingPool = bestPoolId
  return priceSoFar
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 *
 * Callers pass the already-loaded Bundle to avoid a redundant store.get.
 */
export function getTrackedAmountUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  whitelistTokens: string[],
  bundle: Bundle,
): BigDecimal {
  const price0USD = token0.derivedETH.times(bundle.ethPriceUSD)
  const price1USD = token1.derivedETH.times(bundle.ethPriceUSD)

  // both are whitelist tokens, return sum of both amounts
  if (whitelistTokens.includes(token0.id) && whitelistTokens.includes(token1.id)) {
    return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD))
  }

  // take double value of the whitelisted token amount
  if (whitelistTokens.includes(token0.id) && !whitelistTokens.includes(token1.id)) {
    return tokenAmount0.times(price0USD).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!whitelistTokens.includes(token0.id) && whitelistTokens.includes(token1.id)) {
    return tokenAmount1.times(price1USD).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked amount is 0
  return ZERO_BD
}

export function calculateAmountUSD(
  amount0: BigDecimal,
  amount1: BigDecimal,
  token0DerivedETH: BigDecimal,
  token1DerivedETH: BigDecimal,
  ethPriceUSD: BigDecimal,
): BigDecimal {
  return amount0.times(token0DerivedETH.times(ethPriceUSD)).plus(amount1.times(token1DerivedETH.times(ethPriceUSD)))
}
