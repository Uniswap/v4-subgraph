import {
  Address,
  BigInt,
  Bytes,
  crypto,
  ethereum,
  store,
  log
} from '@graphprotocol/graph-ts'

import {
  PoolDeployed as HookDeployedEvent,
  PoolUninstalled as HookUninstalledEvent,
  PoolConfig as HookConfigEvent,
} from '../types/EulerSwapFactory/EulerSwapFactory'
import { EulerSwapHook } from '../types/schema'


export function handleHookDeployed(event: HookDeployedEvent): void {
  // ──────────────────────────────────────────────────────────────
  // Build the composite ID: eulerAccount-asset0-asset1
  // ──────────────────────────────────────────────────────────────
  const account = event.params.eulerAccount.toHexString()
  const asset0  = event.params.asset0.toHexString()
  const asset1  = event.params.asset1.toHexString()

  const id = `${account}-${asset0}-${asset1}`          // <- entity id

  // ──────────────────────────────────────────────────────────────
  // Load (or create) the row for this tuple
  // ──────────────────────────────────────────────────────────────
  let entity = EulerSwapHook.load(id)
  if (entity == null) {
    // This is a logic error → stop indexing so we notice immediately
    log.critical('PoolConfig emitted before PoolDeployed for id {}', [id])
    return 
  }

  // Always overwrite the hook address so the latest hook is used
  entity.hook = event.params.pool.toHexString()

  entity.save()
}

export function handleHookUninstalled(event: HookUninstalledEvent): void {
  // ──────────────────────────────────────────────────────────────
  // Build the composite ID: eulerAccount-asset0-asset1
  // ──────────────────────────────────────────────────────────────
  const account = event.params.eulerAccount.toHexString()
  const asset0  = event.params.asset0.toHexString()
  const asset1  = event.params.asset1.toHexString()

  const id = `${account}-${asset0}-${asset1}`          // <- entity id

  // ──────────────────────────────────────────────────────────────
  // Load (or create) the row for this tuple
  // ──────────────────────────────────────────────────────────────
  let entity = EulerSwapHook.load(id)
  if (entity != null && entity.hook == event.params.pool.toHexString()) {
    store.remove("EulerSwapHook", id)
  }
}

// ───────────────────────────────────────────────────────────────
// NEW: PoolConfig — derive poolId from PoolKey
// ───────────────────────────────────────────────────────────────
export function handlePoolConfig(event: HookConfigEvent): void {
  // params struct fields
  const p          = event.params.params
  const account    = p.eulerAccount.toHexString()
  const asset0     = p.currency0.toHexString()            // ↳ names may differ
  const asset1     = p.currency1.toHexString()
  const id         = `${account}-${asset0}-${asset1}`

  // Load / lazily create the row
  let hookRow = EulerSwapHook.load(id)
  if (hookRow == null) {
    hookRow               = new EulerSwapHook(id)
    hookRow.eulerAccount  = p.eulerAccount
    hookRow.asset0        = p.currency0
    hookRow.asset1        = p.currency1
    hookRow.hook          = event.params.pool              // same as earlier emit
  }

  // -----------------------------------------------------------------
  // Compose PoolKey = (currency0,currency1,fee,hooks,tickSpacing)
  // tickSpacing is hard-coded to 1
  // -----------------------------------------------------------------
  const encoded = ethereum.encode(
    '(address,address,uint24,address,int24)',
    [
      ethereum.Value.fromAddress(p.currency0),
      ethereum.Value.fromAddress(p.currency1),
      ethereum.Value.fromUnsignedBigInt(p.fee as BigInt),  // uint24 → BigInt
      ethereum.Value.fromAddress(event.params.pool),       // hook address
      ethereum.Value.fromI32(1)                            // tickSpacing = 1
    ]
  )!

  const poolId = crypto.keccak256(encoded).toHexString()

  hookRow.poolId = Bytes.fromHexString(poolId) as Bytes
  hookRow.save()
}