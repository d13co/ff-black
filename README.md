# ff-black

## Requirements

[v] Payment to REVENUE_ADDRESS
[v] Purchase options:
  [v] In ALGO with ALGO_PRICE
  [v] In PURCHASE_ASSET with ASSET_AMOUNT

[v] Sales are frozen until UNFREEZE_TIME
[v] After UNFREEZE_TIME anyone will be able to unfreeze their account

[v] Only to whitelisted addresses
  [v] Allowed amount to mint: 5

[v] Admin sets OPTIONS / WL
[v] Admin can opt in to assets

## Setup

- Deploy contract
- Change your asset's freeze account to be the contract's escrow account (so it can freeze/unfreeze)
- Choose a revenue address to receive payments. Opt it in to USDC.
- Configure the contract with `setConfig`. Also opts in to sellingAsset.
  - Fields are documented at the top of contract.algo.ts
- Add whitelisted accounts with `addWhitelist`. You can do 8x per app call, 128 per group txn.
- Send selling asset to contract.

(Partial) tests are available under smart_contracts/ff_black/contract.e2e.spec.ts - these show how to call, etc.
