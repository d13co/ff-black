import {
  Account,
  arc4,
  Asset,
  BoxMap,
  Contract,
  err,
  Global,
  GlobalState,
  gtxn,
  itxn,
  log,
  TransactionType,
  Txn,
  uint64,
} from '@algorandfoundation/algorand-typescript'
import { abimethod, Address, Struct, UintN64 } from '@algorandfoundation/algorand-typescript/arc4'

class ContractConfig extends Struct<{
  revenueAddress: Address
  sellingAsset: UintN64
  algoPrice: UintN64
  purchaseAsset: UintN64
  assetPrice: UintN64
  unfreezeTime: UintN64
}> {}

export class FfBlack extends Contract {
  admin = GlobalState<Account>({ initialValue: Txn.sender })
  revenueAddress = GlobalState<Account>({ initialValue: Txn.sender })

  sellingAsset = GlobalState<Asset>({ initialValue: Asset(0) })
  algoPrice = GlobalState<uint64>({ initialValue: 0 })
  purchaseAsset = GlobalState<Asset>({ initialValue: Asset(0) })
  assetPrice = GlobalState<uint64>({ initialValue: 0 })

  unfreezeTime = GlobalState<uint64>({ initialValue: 0 })

  wl = BoxMap<Account, uint64>({ keyPrefix: '' })

  public buy(txn: gtxn.Transaction) {
    const buyer = Txn.sender
    const sellingAsset = this.sellingAsset.value
    // validate payment and get quantity
    const qty = this.validatePayment(txn)

    // ensure WL exists and has quota. save updated quota
    ensure(this.wl(buyer).exists, 'ERR:NO_WL')
    const remaining = this.wl(buyer).value
    ensure(remaining >= qty, 'ERR:QUOTA')
    this.wl(buyer).value = remaining - qty

    // send NFT(s)
    itxn
      .assetTransfer({
        xferAsset: sellingAsset,
        assetReceiver: buyer,
        assetAmount: qty,
      })
      .submit()

    // freeze buyer if needed
    if (!sellingAsset.frozen(buyer)) {
      itxn
        .assetFreeze({
          freezeAsset: sellingAsset,
          freezeAccount: buyer,
          frozen: true,
        })
        .submit()
    }
  }

  /**
   * Validate payment and return quantity being purchased
   * @param txn Payment transaction
   * @returns quantity of NFTs to buy
   */
  private validatePayment(txn: gtxn.Transaction): uint64 {
    ensure(Txn.groupIndex > 0, 'ERR:GTXN')
    switch (txn.type) {
      case TransactionType.Payment:
        // ALGO. Confirm receiver
        ensure(txn.receiver === this.revenueAddress.value, 'ERR:PAYRCV')
        // Confirm minimum
        ensure(txn.amount >= this.algoPrice.value, 'ERR:UNDERPAY')
        // Confirm precise amounts - no dust
        ensure(txn.amount % this.algoPrice.value === 0, 'ERR:OVERPAY')
        // return number of NFTs to buy
        return txn.amount / this.algoPrice.value
      case TransactionType.AssetTransfer:
        // USDC. Confirm receiver
        ensure(txn.assetReceiver === this.revenueAddress.value, 'ERR:PAYRCV')
        // confirm correct asset
        ensure(txn.xferAsset === this.purchaseAsset.value, 'ERR:ASSET')
        // Confirm minimum
        ensure(txn.assetAmount >= this.assetPrice.value, 'ERR:UNDERPAY')
        // Confirm precise amounts - no dust
        ensure(txn.assetAmount % this.assetPrice.value === 0, 'ERR:OVERPAY')
        // return number of NFTs to buy
        return txn.assetAmount / this.assetPrice.value
      default:
        log('ERR:PAYTYPE')
        err()
    }
  }

  public unfreeze(account: Account) {
    if (Global.latestTimestamp < this.unfreezeTime.value) {
      // admin only can unfreeze
    }
    const sellingAsset = this.sellingAsset.value
    itxn
      .assetFreeze({
        freezeAsset: sellingAsset,
        freezeAccount: account,
        frozen: false,
      })
      .submit()
  }

  public addWhitelist(accounts: arc4.Address[]) {
    this.ensureAdmin()

    for (const account of accounts) {
      this.wl(account.native).value = 5
    }
  }

  public removeWhitelist(accounts: arc4.Address[]) {
    this.ensureAdmin()

    for (const account of accounts) {
      this.wl(account.native).delete()
    }
  }

  public optin(asset: Asset) {
    this.ensureAdmin()

    itxn
      .assetTransfer({
        xferAsset: asset,
        assetReceiver: Global.currentApplicationAddress,
      })
      .submit()
  }

  @abimethod({ readonly: true })
  public getConfig(): ContractConfig {
    return new ContractConfig({
      revenueAddress: new Address(this.revenueAddress.value),
      sellingAsset: au64(this.sellingAsset.value.id),
      algoPrice: au64(this.algoPrice.value),
      purchaseAsset: au64(this.purchaseAsset.value.id),
      assetPrice: au64(this.assetPrice.value),
      unfreezeTime: au64(this.unfreezeTime.value),
    })
  }

  public setConfig(config: ContractConfig) {
    this.ensureAdmin()

    this.revenueAddress.value = config.revenueAddress.native
    this.sellingAsset.value = Asset(config.sellingAsset.native)
    this.algoPrice.value = config.algoPrice.native
    this.purchaseAsset.value = Asset(config.purchaseAsset.native)
    this.assetPrice.value = config.assetPrice.native
    this.unfreezeTime.value = config.unfreezeTime.native
  }

  private ensureAdmin() {
    ensure(Txn.sender === this.admin.value, 'ERR:UNAUTH')
  }
}

function au64(value: uint64) {
  return new UintN64(value)
}

function ensure(cond: boolean, message: string) {
  if (!cond) {
    log(message)
    err()
  }
}
