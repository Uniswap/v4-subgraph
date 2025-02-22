import { Subscription as SubscriptionEvent } from '../types/PositionManager/PositionManager'
import { Subscribe } from '../types/schema'
import { loadTransaction } from '../utils'
import { eventId, positionId } from '../utils/id'

// The subgraph handler must have this signature to be able to handle events,
// however, we invoke a helper in order to inject dependencies for unit tests.
export function handleSubscription(event: SubscriptionEvent): void {
  handleSubscriptionHelper(event)
}

export function handleSubscriptionHelper(event: SubscriptionEvent): void {
  const subscription = new Subscribe(eventId(event.transaction.hash, event.logIndex))

  const transaction = loadTransaction(event)

  subscription.tokenId = event.params.tokenId
  subscription.address = event.params.subscriber
  subscription.origin = event.transaction.from
  subscription.transaction = transaction.id
  subscription.logIndex = event.logIndex
  subscription.timestamp = transaction.timestamp
  subscription.position = positionId(event.params.tokenId)

  subscription.save()
}
