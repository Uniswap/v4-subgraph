import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import { exponentToBigDecimal, safeDiv } from '../utils/index'
import { Bundle, Pool, Token } from './../types/schema'
import { ADDRESS_ZERO, ONE_BD, ZERO_BD, ZERO_BI } from './constants'
import { NativeTokenDetails } from './nativeTokenDetails'

const Q192 = BigInt.fromI32(2).pow(192 as u8)

/**
 * Cap how many whitelist pools findNativePerToken will walk. Tokens with long
 * whitelistPools lists otherwise cost O(N) store.gets (Pool + other Token) per
 * call, twice per swap. Prefer the first K entries; pool init appends newest
 * pools at the end so older/larger pools tend to sit earlier.
 */
const MAX_WHITELIST_POOLS_TO_WALK = 8

class NativeQuote {
  price: BigDecimal
  ethLocked: BigDecimal

  constructor(price: BigDecimal, ethLocked: BigDecimal) {
    this.price = price
    this.ethLocked = ethLocked
  }
}

export class EntityLoadCache {
  private pools: Map<string, Pool>
  private tokens: Map<string, Token>

  constructor() {
    this.pools = new Map<string, Pool>()
    this.tokens = new Map<string, Token>()
  }

  putPool(pool: Pool): void {
    this.pools.set(pool.id, pool)
  }

  putToken(token: Token): void {
    this.tokens.set(token.id, token)
  }

  getPool(id: string): Pool | null {
    if (this.pools.has(id)) {
      return this.pools.get(id)
    }
    const loaded = Pool.load(id)
    if (loaded !== null) {
      this.pools.set(id, loaded)
    }
    return loaded
  }

  getToken(id: string): Token | null {
    if (this.tokens.has(id)) {
      return this.tokens.get(id)
    }
    const loaded = Token.load(id)
    if (loaded !== null) {
      this.tokens.set(id, loaded)
    }
    return loaded
  }
}

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
  cache: EntityLoadCache = new EntityLoadCache(),
): BigDecimal {
  // On chains where the native/reference token is itself a USD stablecoin (e.g. Arc, whose native
  // gas token is USDC and which has no wrapped-native / reference-stable pool), the native price is
  // 1 by definition. Such chains opt in by setting stablecoinWrappedNativePoolId to '' (empty).
  if (stablecoinWrappedNativePoolId == '') {
    return ONE_BD
  }
  const stablecoinWrappedNativePool = cache.getPool(stablecoinWrappedNativePoolId)
  if (stablecoinWrappedNativePool !== null) {
    return stablecoinIsToken0 ? stablecoinWrappedNativePool.token0Price : stablecoinWrappedNativePool.token1Price
  } else {
    return ZERO_BD
  }
}

function quoteFromPool(token: Token, pool: Pool, cache: EntityLoadCache): NativeQuote | null {
  if (pool.liquidity.le(ZERO_BI)) {
    return null
  }
  if (pool.token0 == token.id) {
    const token1 = cache.getToken(pool.token1)
    if (token1 === null) {
      return null
    }
    return new NativeQuote(
      pool.token1Price.times(token1.derivedETH as BigDecimal),
      pool.totalValueLockedToken1.times(token1.derivedETH),
    )
  }
  if (pool.token1 == token.id) {
    const token0 = cache.getToken(pool.token0)
    if (token0 === null) {
      return null
    }
    return new NativeQuote(
      pool.token0Price.times(token0.derivedETH as BigDecimal),
      pool.totalValueLockedToken0.times(token0.derivedETH),
    )
  }
  return null
}

function walkWhitelist(token: Token, minimumNativeLocked: BigDecimal, cache: EntityLoadCache): NativeQuote | null {
  const whiteList = token.whitelistPools
  let largestLiquidityETH = ZERO_BD
  let priceSoFar = ZERO_BD
  let bestPoolId: string | null = null
  const walkLimit = whiteList.length < MAX_WHITELIST_POOLS_TO_WALK ? whiteList.length : MAX_WHITELIST_POOLS_TO_WALK
  for (let i = 0; i < walkLimit; ++i) {
    const poolAddress = whiteList[i]
    const pool = cache.getPool(poolAddress)
    if (pool === null) {
      continue
    }
    const quote = quoteFromPool(token, pool, cache)
    if (quote === null) {
      continue
    }
    if (quote.ethLocked.gt(largestLiquidityETH) && quote.ethLocked.gt(minimumNativeLocked)) {
      largestLiquidityETH = quote.ethLocked
      priceSoFar = quote.price
      bestPoolId = pool.id
    }
  }
  if (bestPoolId !== null) {
    token.derivedETHPool = bestPoolId
    return new NativeQuote(priceSoFar, largestLiquidityETH)
  }
  return null
}

/**
 * Search through graph to find derived Eth per token.
 * Callers pass the already-loaded Bundle to avoid a redundant store.get.
 * `cache` reuses Pool/Token loads within one handler.
 * `candidate` is the pool that just swapped; if it is (or becomes) the best
 * pricing pool we skip the whitelist walk.
 */
export function findNativePerToken(
  token: Token,
  wrappedNativeAddress: string,
  stablecoinAddresses: string[],
  minimumNativeLocked: BigDecimal,
  bundle: Bundle,
  cache: EntityLoadCache = new EntityLoadCache(),
  candidate: Pool | null = null,
): BigDecimal {
  if (token.id == wrappedNativeAddress || token.id == ADDRESS_ZERO) {
    return ONE_BD
  }

  // hardcoded fix for incorrect rates
  // if whitelist includes token - get the safe price
  if (stablecoinAddresses.includes(token.id)) {
    return safeDiv(ONE_BD, bundle.ethPriceUSD)
  }

  cache.putToken(token)

  let candidateQuote: NativeQuote | null = null
  if (candidate !== null) {
    cache.putPool(candidate)
    candidateQuote = quoteFromPool(token, candidate, cache)
  }

  const stickyId = token.derivedETHPool
  if (stickyId !== null) {
    if (candidate !== null && stickyId == candidate.id) {
      if (candidateQuote !== null && candidateQuote.ethLocked.gt(minimumNativeLocked)) {
        return candidateQuote.price
      }
    } else {
      const stickyPool = cache.getPool(stickyId)
      if (stickyPool !== null) {
        const stickyQuote = quoteFromPool(token, stickyPool, cache)
        if (stickyQuote !== null && stickyQuote.ethLocked.gt(minimumNativeLocked)) {
          if (candidateQuote !== null && candidate !== null && candidateQuote.ethLocked.gt(stickyQuote.ethLocked)) {
            token.derivedETHPool = candidate.id
            return candidateQuote.price
          }
          return stickyQuote.price
        }
      }
    }
  }

  const walked = walkWhitelist(token, minimumNativeLocked, cache)
  if (walked !== null) {
    return walked.price
  }
  if (candidateQuote !== null && candidate !== null && candidateQuote.ethLocked.gt(minimumNativeLocked)) {
    token.derivedETHPool = candidate.id
    return candidateQuote.price
  }
  return ZERO_BD
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
