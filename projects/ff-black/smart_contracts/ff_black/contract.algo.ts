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
import { Address, Struct, UintN64 } from '@algorandfoundation/algorand-typescript/arc4'

// see global state for docs
class ContractConfig extends Struct<{
  revenueAddress: Address
  sellingAsset: UintN64
  algoPrice: UintN64
  purchaseAsset: UintN64
  assetPrice: UintN64
  unfreezeTime: UintN64
}> {}

export class FfBlack extends Contract {
  // configures contract stuff
  admin = GlobalState<Account>({ initialValue: Txn.sender })
  // receiver of payments
  revenueAddress = GlobalState<Account>({ initialValue: Txn.sender })
  // asset ID we are selling
  sellingAsset = GlobalState<Asset>({ initialValue: Asset(0) })
  // price of asset in ALGO
  algoPrice = GlobalState<uint64>({ initialValue: 0 })
  // alternative purchase asset, e.g. USDC
  purchaseAsset = GlobalState<Asset>({ initialValue: Asset(0) })
  // price in alternative purchase asset
  assetPrice = GlobalState<uint64>({ initialValue: 0 })
  // unix timestamp after which unfreezing becomes open to anyone
  // NOTE: Second-level precision! e.g. 1753223497 good / 1753223497000 bad
  unfreezeTime = GlobalState<uint64>({ initialValue: 0 })
  // whitelist box map, value: remaining quota, e.g. 5
  wl = BoxMap<Account, uint64>({ keyPrefix: '' })

  /**
   * Buy NFT. Account must be on whitelist. Freezes buyer after, if not frozen already
   * @param txn Payment or asset transfer transaction
   */
  public buy(txn: gtxn.Transaction) {
    const buyer = Txn.sender
    const sellingAsset = this.sellingAsset.value
    // validate payment and get quantity
    const qty = this.validatePayment(txn)

    // ensure WL exists and has quota. save updated quota
    ensure(this.wl(buyer).exists, 'ERR:NO_WL')
    const quota = this.wl(buyer).value
    ensure(quota >= qty, 'ERR:QUOTA')
    const remaining: uint64 = quota - qty
    if (remaining === 0) {
      this.wl(buyer).delete()
    } else {
      this.wl(buyer).value = quota - qty
    }

    // send NFT(s)
    itxn
      .assetTransfer({
        xferAsset: sellingAsset,
        assetReceiver: buyer,
        assetAmount: qty,
      })
      .submit()

    // freeze buyer if needed. only until unfreezeTime
    if (Global.latestTimestamp < this.unfreezeTime.value && !sellingAsset.frozen(buyer)) {
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
    // if no payment txn, fail gracefully before accessing txn fields
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

  /**
   * Unfreeze account. Before unfreezeTime, only admin can unfreeze
   * After unfreezeTime, anyone can unfreeze anyone else
   * @param account account to unfreeze
   */
  public unfreeze(account: Account) {
    // admin only can unfreeze before unfreezeTime
    // open after that
    if (Global.latestTimestamp < this.unfreezeTime.value) {
      this.ensureAdmin()
    }
    itxn
      .assetFreeze({
        freezeAsset: this.sellingAsset.value,
        freezeAccount: account,
        frozen: false,
      })
      .submit()
  }

  /**
   * Add multiple accounts to whitelist.
   * Buy quota is hardcoded to 5
   * @param accounts accounts to add to WL
   */
  public addWhitelist(accounts: arc4.Address[]) {
    this.ensureAdmin()

    for (const account of accounts) {
      this.wl(account.native).value = 5
    }
  }

  /**
   * Remove accounts from whitelist. Fails if any are not on WL
   * @param accounts accounts to remove from WL
   */
  public removeWhitelist(accounts: arc4.Address[]) {
    this.ensureAdmin()

    for (const account of accounts) {
      this.wl(account.native).delete()
    }
  }

  /**
   * Opt in to asset. Should not be needed
   * @param asset asset to opt in to
   */
  public optin(asset: Asset) {
    this.ensureAdmin()

    this._optin(asset)
  }

  // Subroutine reused by public optin and setConfig
  private _optin(asset: Asset) {
    itxn
      .assetTransfer({
        xferAsset: asset,
        assetReceiver: Global.currentApplicationAddress,
      })
      .submit()
  }

  /**
   * Set configuration values & opt in to selling asset - WARNING: REPLACES ALL VALUES
   * @param config new config
   */
  public setConfig(config: ContractConfig) {
    this.ensureAdmin()

    this.revenueAddress.value = config.revenueAddress.native
    this.sellingAsset.value = Asset(config.sellingAsset.native)
    this.algoPrice.value = config.algoPrice.native
    this.purchaseAsset.value = Asset(config.purchaseAsset.native)
    this.assetPrice.value = config.assetPrice.native
    this.unfreezeTime.value = config.unfreezeTime.native

    if (!Global.currentApplicationAddress.isOptedIn(this.sellingAsset.value)) {
      this._optin(this.sellingAsset.value)
    }
  }

  /**
   * change admin account. Admin only
   * @param newAdmin new admin account
   */
  public changeAdmin(newAdmin: Account) {
    this.ensureAdmin()

    this.admin.value = newAdmin
  }

  /**
   * Close out of an asset, sending everything to caller (admin)
   * @param asset asset to close out of
   */
  public assetCloseout(asset: Asset) {
    this.ensureAdmin()

    itxn
      .assetTransfer({
        xferAsset: asset,
        assetCloseTo: Txn.sender,
      })
      .submit()
  }

  /**
   * Close out of all algo, sending everything to caller (admin)
   * Requires baseline MBR, i.e. no boxes remaining
   * @param asset asset to close out of
   */
  public algoCloseout() {
    this.ensureAdmin()

    itxn
      .payment({
        closeRemainderTo: Txn.sender,
      })
      .submit()
  }

  // ensure caller is admin
  private ensureAdmin() {
    ensure(Txn.sender === this.admin.value, 'ERR:UNAUTH')
  }
}

// like assert but with arc56 logging
function ensure(cond: boolean, message: string) {
  if (!cond) {
    log(message)
    err()
  }
}
