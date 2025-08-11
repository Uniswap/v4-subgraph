import { LogCreatePrivateHook } from '../types/ArrakisHookFactory/ArrakisHookFactory'
import { ArrakisHook } from '../types/schema'

export function handleArrakisHookDeployed(event: LogCreatePrivateHook): void {
  const hook = new ArrakisHook(event.params.hook.toHexString())
  hook.module = event.params.module
  hook.salt = event.params.salt
  hook.createdAtTimestamp = event.block.timestamp
  hook.createdAtBlockNumber = event.block.number
  hook.save()
}
