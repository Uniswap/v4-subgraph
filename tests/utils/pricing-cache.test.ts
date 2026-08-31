import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { assert, beforeAll, describe, test } from 'matchstick-as'

import { Bundle, Pool, Token } from '../../src/types/schema'
import { ONE_BD } from '../../src/utils/constants'
import { EntityLoadCache, findNativePerToken } from '../../src/utils/pricing'
import {
  createAndStoreTestPool,
  createAndStoreTestToken,
  TEST_CONFIG,
  TEST_ETH_PRICE_USD,
  TEST_WETH_DERIVED_ETH,
  WBTC_MAINNET_FIXTURE,
  WBTC_WETH_03_MAINNET_POOL_FIXTURE,
  WBTC_WETH_POOL_ID,
  WETH_MAINNET_FIXTURE,
} from '../handlers/constants'

describe('findNativePerToken sticky pool', () => {
  beforeAll(() => {
    const bundle = new Bundle('1')
    bundle.ethPriceUSD = TEST_ETH_PRICE_USD
    bundle.save()

    const weth = createAndStoreTestToken(WETH_MAINNET_FIXTURE)
    weth.derivedETH = TEST_WETH_DERIVED_ETH
    weth.save()

    const wbtc = createAndStoreTestToken(WBTC_MAINNET_FIXTURE)
    wbtc.derivedETH = BigDecimal.fromString('20')
    wbtc.whitelistPools = [WBTC_WETH_POOL_ID]
    wbtc.save()

    const pool = createAndStoreTestPool(WBTC_WETH_03_MAINNET_POOL_FIXTURE)
    pool.liquidity = BigInt.fromString('1000')
    pool.token0Price = BigDecimal.fromString('0.05')
    pool.token1Price = BigDecimal.fromString('20')
    pool.totalValueLockedToken0 = BigDecimal.fromString('1')
    pool.totalValueLockedToken1 = BigDecimal.fromString('20')
    pool.save()
  })

  test('walk sets derivedETHPool then sticky skips extra loads', () => {
    const bundle = Bundle.load('1')!
    const wbtc = Token.load(WBTC_MAINNET_FIXTURE.address)!
    const pool = Pool.load(WBTC_WETH_POOL_ID)!
    const cache = new EntityLoadCache()
    cache.putPool(pool)
    cache.putToken(wbtc)
    cache.putToken(Token.load(WETH_MAINNET_FIXTURE.address)!)

    const first = findNativePerToken(
      wbtc,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
      bundle,
      cache,
      pool,
    )
    assert.assertTrue(first.gt(BigDecimal.fromString('0')))
    assert.fieldEquals('Token', WBTC_MAINNET_FIXTURE.address, 'derivedETHPool', WBTC_WETH_POOL_ID)

    const sticky = Token.load(WBTC_MAINNET_FIXTURE.address)!
    const second = findNativePerToken(
      sticky,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
      bundle,
      cache,
      pool,
    )
    assert.assertTrue(first.equals(second))
  })

  test('cache returns the same pool instance', () => {
    const pool = Pool.load(WBTC_WETH_POOL_ID)!
    const cache = new EntityLoadCache()
    cache.putPool(pool)
    const again = cache.getPool(WBTC_WETH_POOL_ID)
    assert.assertTrue(again !== null)
    assert.fieldEquals('Pool', WBTC_WETH_POOL_ID, 'id', pool.id)
  })

  test('wrapped native short-circuits to 1', () => {
    const bundle = Bundle.load('1')!
    const weth = Token.load(WETH_MAINNET_FIXTURE.address)!
    const price = findNativePerToken(
      weth,
      TEST_CONFIG.wrappedNativeAddress,
      TEST_CONFIG.stablecoinAddresses,
      TEST_CONFIG.minimumNativeLocked,
      bundle,
    )
    assert.assertTrue(price.equals(ONE_BD))
  })
})
