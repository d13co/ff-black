# ff-black

## Requirements

- Payment to `revenueAddress`
- Purchase options:
  - In ALGO with `algoPrice`
  - In `purchaseAsset` with `assetPrice`

- buyers are frozen after selling (until `unfreezeTime`)
- After `unfreezeTime` anyone will be able to unfreeze their account

- Only to whitelisted addresses
  - Allowed amount to mint: 5

- Admin sets configuration & whitelist
- Admin can opt in to assets / close out assets / algo

## Setup

- Deploy contract
- Change your asset's freeze account to be the contract's escrow account (so it can freeze/unfreeze)
- Choose a revenue address to receive payments. Opt it in to USDC.
- Configure the contract with `setConfig`. Also opts in to sellingAsset.
  - Fields are documented at the top of contract.algo.ts
- Add whitelisted accounts with `addWhitelist`. You can do 8x per app call, 128 per group txn.
- Send selling asset to contract.

## Usage

(Partial) tests are available under smart_contracts/ff_black/contract.e2e.spec.ts - these show how to call, etc.
