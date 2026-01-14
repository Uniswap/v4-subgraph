export function isPoolInShard(poolId: string, numShards: number, shardNumber: number): boolean {
  const lastByteHex = poolId.slice(-2)
  const lastByte = parseInt(lastByteHex, 16)
  return lastByte % numShards == shardNumber
}
