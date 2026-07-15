import { BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'
import { assert, beforeEach, clearStore, describe, test } from 'matchstick-as'

import { handleProtocolFeeUpdated } from '../../src/mappings/poolManager'
import { ProtocolFeeUpdated } from '../../src/types/PoolManager/PoolManager'
import {
  assertObjectMatches,
  createAndStoreTestPool,
  MOCK_EVENT,
  USDC_WETH_05_MAINNET_POOL_FIXTURE,
  USDC_WETH_POOL_ID,
} from './constants'

const id = Bytes.fromHexString(USDC_WETH_POOL_ID) as Bytes

// Packed uint24: upper 12 bits = one-for-zero fee, lower 12 bits =
// zero-for-one fee, both in hundredths of a bip. (300 << 12) | 500.
const PACKED_PROTOCOL_FEE = (300 << 12) | 500

const createProtocolFeeUpdatedEvent = (poolId: Bytes, protocolFee: i32): ProtocolFeeUpdated => {
  return new ProtocolFeeUpdated(
    MOCK_EVENT.address,
    MOCK_EVENT.logIndex,
    MOCK_EVENT.transactionLogIndex,
    MOCK_EVENT.logType,
    MOCK_EVENT.block,
    MOCK_EVENT.transaction,
    [
      new ethereum.EventParam('id', ethereum.Value.fromFixedBytes(poolId)),
      new ethereum.EventParam('protocolFee', ethereum.Value.fromI32(protocolFee)),
    ],
    MOCK_EVENT.receipt,
  )
}

describe('handleProtocolFeeUpdated', () => {
  beforeEach(() => {
    clearStore()
  })

  test('stores the raw packed protocol fee on the pool', () => {
    createAndStoreTestPool(USDC_WETH_05_MAINNET_POOL_FIXTURE)

    handleProtocolFeeUpdated(createProtocolFeeUpdatedEvent(id, PACKED_PROTOCOL_FEE))

    assertObjectMatches('Pool', USDC_WETH_POOL_ID, [['protocolFee', BigInt.fromI32(PACKED_PROTOCOL_FEE).toString()]])
  })

  test('a later update overwrites the stored value, including back to 0', () => {
    createAndStoreTestPool(USDC_WETH_05_MAINNET_POOL_FIXTURE)

    handleProtocolFeeUpdated(createProtocolFeeUpdatedEvent(id, PACKED_PROTOCOL_FEE))
    handleProtocolFeeUpdated(createProtocolFeeUpdatedEvent(id, 0))

    assertObjectMatches('Pool', USDC_WETH_POOL_ID, [['protocolFee', '0']])
  })

  test('ignores events for unknown pools', () => {
    const unknownPoolId = Bytes.fromHexString(
      '0x00000000000000000000000000000000000000000000000000000000000000ff',
    ) as Bytes

    handleProtocolFeeUpdated(createProtocolFeeUpdatedEvent(unknownPoolId, PACKED_PROTOCOL_FEE))

    assert.entityCount('Pool', 0)
  })
})
