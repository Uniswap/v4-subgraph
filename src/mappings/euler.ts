import { PoolDeployed as HookDeployedEvent } from '../types/EulerSwapFactory/EulerSwapFactory'
import { EulerSwapHook } from '../types/schema'

export function handleHookDeployed(event: HookDeployedEvent): void {
  // ──────────────────────────────────────────────────────────────
  // Build the composite ID: eulerAccount-token0-token1
  // ──────────────────────────────────────────────────────────────
  const account = event.params.account.toHexString()
  const token0  = event.params.token0.toHexString()
  const token1  = event.params.token1.toHexString()

  const id = `${account}-${token0}-${token1}`          // <- entity id

  // ──────────────────────────────────────────────────────────────
  // Load (or create) the row for this tuple
  // ──────────────────────────────────────────────────────────────
  let entity = EulerSwapHook.load(id)
  if (entity == null) {
    entity = new EulerSwapHook(id)
    entity.eulerAccount = account
    entity.asset0       = token0
    entity.asset1       = token1
  }

  // Always overwrite the hook address so the latest hook is used
  entity.hook = event.params.pool.toHexString()

  entity.save()
}