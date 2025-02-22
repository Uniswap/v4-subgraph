import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts'

export function positionId(tokenId: BigInt): string {
  return tokenId.toString()
}

export function eventId(transactionHash: Bytes, logIndex: BigInt): Bytes {
  return transactionHash.concatI32(logIndex.toI32())
}

export function poolKeyId(token0: Address, token1: Address, fee: BigInt, tickSpacing: BigInt, hooks: Address): string {
  return `${token0.toHexString()}-${token1.toHexString()}-${fee.toString()}-${tickSpacing.toString()}-${hooks.toHexString()}`
}
