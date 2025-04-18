import { log } from '@graphprotocol/graph-ts'

import { SetConfigBorrowToken as SetConfigBorrowTokenEvent } from '../types/KittycornBank/KittycornBank'
import { BankAsset, Token } from '../types/schema'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { ZERO_BD, ZERO_BI } from '../utils/constants'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from '../utils/token'

// The subgraph handler must have this signature to be able to handle events,
// however, we invoke a helper in order to inject dependencies for unit tests.
export function handleConfigBorrowToken(event: SetConfigBorrowTokenEvent): void {
  handleConfigBorrowTokenHelper(event)
}

export function handleConfigBorrowTokenHelper(
  event: SetConfigBorrowTokenEvent,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const assetId = event.params.ulToken.toHexString()
  const allowBorrow = event.params.allowBorrow
  const borrowFee = event.params.borrowFee

  const tokenOverrides = subgraphConfig.tokenOverrides
  const nativeTokenDetails = subgraphConfig.nativeTokenDetails

  let token = Token.load(assetId)

  // fetch info if null
  if (token === null) {
    token = new Token(assetId)
    token.symbol = fetchTokenSymbol(event.params.ulToken, tokenOverrides, nativeTokenDetails)
    token.name = fetchTokenName(event.params.ulToken, tokenOverrides, nativeTokenDetails)
    token.totalSupply = fetchTokenTotalSupply(event.params.ulToken)
    const decimals = fetchTokenDecimals(event.params.ulToken, tokenOverrides, nativeTokenDetails)

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug('mybug the decimal on token was null', [])
      return
    }

    token.decimals = decimals
    token.derivedETH = ZERO_BD
    token.volume = ZERO_BD
    token.volumeUSD = ZERO_BD
    token.feesUSD = ZERO_BD
    token.untrackedVolumeUSD = ZERO_BD
    token.totalValueLocked = ZERO_BD
    token.totalValueLockedUSD = ZERO_BD
    token.totalValueLockedUSDUntracked = ZERO_BD
    token.txCount = ZERO_BI
    token.poolCount = ZERO_BI
    token.whitelistPools = []
  }

  let bank = BankAsset.load(assetId)
  if (bank === null) {
    bank = new BankAsset(assetId)
    bank.token = token.id
    bank.totalSupply = ZERO_BI
    bank.supplyAPY = ZERO_BI
    bank.borrowAPY = ZERO_BI
    bank.borrowFee = ZERO_BI
  }

  bank.allowBorrow = allowBorrow
  bank.borrowFee = borrowFee

  bank.save()
}
