import { store } from '@graphprotocol/graph-ts'

import {
  PoolDeployed as HookDeployedEvent,
  PoolUninstalled as HookUninstalledEvent
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
    entity = new EulerSwapHook(id)
    entity.eulerAccount = account
    entity.asset0       = asset0
    entity.asset1       = asset1
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