import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'

import { hexToBigInt } from './index'

export const ADDRESS_ZERO = Address.fromString('0x0000000000000000000000000000000000000000')

export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const ZERO_BD = BigDecimal.fromString('0')
export const ONE_BD = BigDecimal.fromString('1')
export const Q96 = BigInt.fromI32(2).pow(96)
export const MaxUint256 = hexToBigInt('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
