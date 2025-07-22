import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { Address } from 'algosdk'

export async function createAsset(
  algorand: AlgorandClient,
  account: Address,
  assetName: string,
  decimals: number,
  freeze: Address,
) {
  const { assetId } = await algorand.send.assetCreate({
    sender: account.toString(),
    total: BigInt(1e10),
    assetName,
    unitName: assetName,
    decimals,
    freeze,
  })
  return assetId
}
