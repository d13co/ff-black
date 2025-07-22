import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { ContractConfig, FfBlackFactory } from '../artifacts/ff_black/FfBlackClient'
import { createAsset } from './test-utils'

describe('FfBlack contract', () => {
  const localnet = algorandFixture()
  beforeAll(() => {
    Config.configure({
      debug: true,
      // traceAll: true,
    })
    registerDebugEventHandlers()
  })
  beforeEach(localnet.newScope)

  const deploy = async (account: Address, overrides?: Partial<ContractConfig>) => {
    const factory = localnet.algorand.client.getTypedAppFactory(FfBlackFactory, {
      defaultSender: account,
    })

    const { appClient: client } = await factory.deploy({
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })

    const [sellingAsset, purchaseAsset, revenueAddress, user1, user2] = await Promise.all([
      createAsset(localnet.algorand, account, 'FOLKS', 0, client.appAddress),
      createAsset(localnet.algorand, account, 'USDC', 6, client.appAddress),
      localnet.context.generateAccount({ initialFunds: (1).algos() }),
      localnet.context.generateAccount({ initialFunds: (15).algos() }),
      localnet.context.generateAccount({ initialFunds: (15).algos() }),
      localnet.algorand.send.payment({
        sender: account.toString(),
        receiver: client.appAddress,
        amount: (5).algos(),
      }),
    ])

    await Promise.all([
      // opt revenue into purchasing asset
      localnet.algorand.send.assetOptIn({ assetId: purchaseAsset, sender: revenueAddress.toString() }),
      // configure & opt in to sellingAsset
      client.send.setConfig({
        args: {
          config: {
            algoPrice: 1_000_000n,
            assetPrice: 2_000_00n,
            purchaseAsset,
            sellingAsset,
            revenueAddress: revenueAddress.toString(),
            unfreezeTime: 999_999_999_999n,
            ...overrides,
          },
        },
        extraFee: (2000).microAlgo(),
      }),
      client.send.addWhitelist({ args: { accounts: [user1.toString(), user2.toString()] } }),
    ])

    // send selling asset to contract
    await localnet.algorand.send.assetTransfer({
      amount: 1_000_000n,
      assetId: sellingAsset,
      receiver: client.appAddress,
      sender: account.toString(),
    })

    return { client, purchaseAsset, sellingAsset, revenueAddress, user1, user2 }
  }

  test('buy 1x with algo', async () => {
    const { testAccount } = localnet.context
    const { client, user1 } = await deploy(testAccount)

    const { revenueAddress, algoPrice, sellingAsset } = await client.state.global.getAll()
    const userClient = client.clone({ defaultSender: user1 })
    await userClient
      .newGroup()
      // opt in to asset
      .addTransaction(
        await client.algorand.createTransaction.assetOptIn({
          sender: user1,
          assetId: sellingAsset!,
        }),
      )
      .buy({
        args: {
          txn: await client.algorand.createTransaction.payment({
            sender: user1,
            receiver: revenueAddress!,
            amount: algoPrice!.microAlgo(),
          }),
        },
        extraFee: (2000).microAlgo(),
      })
      .send()

    const { assets } = await localnet.algorand.account.getInformation(user1)
    const soldAsset = assets!.find(({ assetId }) => assetId === sellingAsset)

    expect(soldAsset?.amount).toBe(1n)
    expect(soldAsset?.isFrozen).toBe(true)

    const wlRemain = await client.state.box.wl.value(user1.toString())
    expect(wlRemain).toBe(4n)
  })

  test('buy 2x with algo', async () => {
    const { testAccount } = localnet.context
    const { client, user1 } = await deploy(testAccount)

    const { revenueAddress, algoPrice, sellingAsset } = await client.state.global.getAll()
    const userClient = client.clone({ defaultSender: user1 })
    await userClient
      .newGroup()
      // opt in to asset
      .addTransaction(
        await client.algorand.createTransaction.assetOptIn({
          sender: user1,
          assetId: sellingAsset!,
        }),
      )
      .buy({
        args: {
          txn: await client.algorand.createTransaction.payment({
            sender: user1,
            receiver: revenueAddress!,
            amount: (2n * algoPrice!).microAlgo(),
          }),
        },
        extraFee: (2000).microAlgo(),
      })
      .send()

    const { assets } = await localnet.algorand.account.getInformation(user1)
    const soldAsset = assets!.find(({ assetId }) => assetId === sellingAsset)

    expect(soldAsset?.amount).toBe(2n)
    expect(soldAsset?.isFrozen).toBe(true)

    const wlRemain = await client.state.box.wl.value(user1.toString())
    expect(wlRemain).toBe(3n)
  })

  test('buy 5x with algo', async () => {
    const { testAccount } = localnet.context
    const { client, user1 } = await deploy(testAccount)

    const { revenueAddress, algoPrice, sellingAsset } = await client.state.global.getAll()
    const userClient = client.clone({ defaultSender: user1 })
    await userClient
      .newGroup()
      // opt in to asset
      .addTransaction(
        await client.algorand.createTransaction.assetOptIn({
          sender: user1,
          assetId: sellingAsset!,
        }),
      )
      .buy({
        args: {
          txn: await client.algorand.createTransaction.payment({
            sender: user1,
            receiver: revenueAddress!,
            amount: (5n * algoPrice!).microAlgo(),
          }),
        },
        extraFee: (2000).microAlgo(),
      })
      .send()

    const { assets } = await localnet.algorand.account.getInformation(user1)
    const soldAsset = assets!.find(({ assetId }) => assetId === sellingAsset)

    expect(soldAsset?.amount).toBe(5n)
    expect(soldAsset?.isFrozen).toBe(true)

    await expect(client.state.box.wl.value(user1.toString())).rejects.toThrow(/box not found/)
  })

  test('can not buy without WL', async () => {
    const { testAccount } = localnet.context
    const { client, user1 } = await deploy(testAccount)

    await client.send.removeWhitelist({ args: { accounts: [user1.toString()] } })

    const { revenueAddress, algoPrice, sellingAsset } = await client.state.global.getAll()
    const userClient = client.clone({ defaultSender: user1 })
    const buy = userClient
      .newGroup()
      // opt in to asset
      .addTransaction(
        await client.algorand.createTransaction.assetOptIn({
          sender: user1,
          assetId: sellingAsset!,
        }),
      )
      .buy({
        args: {
          txn: await client.algorand.createTransaction.payment({
            sender: user1,
            receiver: revenueAddress!,
            amount: algoPrice!.microAlgo(),
          }),
        },
        extraFee: (2000).microAlgo(),
      })
      .send()

    await expect(buy).rejects.toThrow(/ERR:NO_WL/)
  })

  test('can not buy over quota', async () => {
    const { testAccount } = localnet.context
    const { client, user1 } = await deploy(testAccount)

    const { revenueAddress, algoPrice, sellingAsset } = await client.state.global.getAll()
    const userClient = client.clone({ defaultSender: user1 })
    const buy = userClient
      .newGroup()
      // opt in to asset
      .addTransaction(
        await client.algorand.createTransaction.assetOptIn({
          sender: user1,
          assetId: sellingAsset!,
        }),
      )
      .buy({
        args: {
          txn: await client.algorand.createTransaction.payment({
            sender: user1,
            receiver: revenueAddress!,
            amount: (6n * algoPrice!).microAlgo(),
          }),
        },
        extraFee: (2000).microAlgo(),
      })
      .send()

    await expect(buy).rejects.toThrow(/ERR:QUOTA/)
  })

  test('can buy 2x with asset', async () => {
    const { testAccount } = localnet.context
    const { client, user1 } = await deploy(testAccount)

    const { revenueAddress, assetPrice, sellingAsset, purchaseAsset } = await client.state.global.getAll()

    const qty = 2n
    const amount = qty * assetPrice!
    await localnet.algorand.send.assetOptIn({ sender: user1, assetId: purchaseAsset! })
    await localnet.algorand.send.assetTransfer({
      sender: testAccount,
      amount,
      receiver: user1,
      assetId: purchaseAsset!,
    })

    const userClient = client.clone({ defaultSender: user1 })
    await userClient
      .newGroup()
      // opt in to asset
      .addTransaction(
        await client.algorand.createTransaction.assetOptIn({
          sender: user1,
          assetId: sellingAsset!,
        }),
      )
      .buy({
        args: {
          txn: await client.algorand.createTransaction.assetTransfer({
            sender: user1,
            receiver: revenueAddress!,
            assetId: purchaseAsset!,
            amount,
          }),
        },
        extraFee: (2000).microAlgo(),
      })
      .send()

    const { assets } = await localnet.algorand.account.getInformation(user1)
    const soldAsset = assets!.find(({ assetId }) => assetId === sellingAsset)

    expect(soldAsset?.amount).toBe(qty)
    expect(soldAsset?.isFrozen).toBe(true)

    const wlRemain = await client.state.box.wl.value(user1.toString())
    expect(wlRemain).toBe(5n - qty)
  })

  test('sold unfrozen after unfreezeTime', async () => {
    const { testAccount } = localnet.context
    const { client, user1 } = await deploy(testAccount, { unfreezeTime: 1n })

    const { revenueAddress, assetPrice, sellingAsset, purchaseAsset } = await client.state.global.getAll()

    const qty = 2n
    const amount = qty * assetPrice!
    await localnet.algorand.send.assetOptIn({ sender: user1, assetId: purchaseAsset! })
    await localnet.algorand.send.assetTransfer({
      sender: testAccount,
      amount,
      receiver: user1,
      assetId: purchaseAsset!,
    })

    const userClient = client.clone({ defaultSender: user1 })
    await userClient
      .newGroup()
      // opt in to asset
      .addTransaction(
        await client.algorand.createTransaction.assetOptIn({
          sender: user1,
          assetId: sellingAsset!,
        }),
      )
      .buy({
        args: {
          txn: await client.algorand.createTransaction.assetTransfer({
            sender: user1,
            receiver: revenueAddress!,
            assetId: purchaseAsset!,
            amount,
          }),
        },
        extraFee: (2000).microAlgo(),
      })
      .send()

    const { assets } = await localnet.algorand.account.getInformation(user1)
    const soldAsset = assets!.find(({ assetId }) => assetId === sellingAsset)

    expect(soldAsset?.amount).toBe(qty)
    expect(soldAsset?.isFrozen).toBe(false)

    const wlRemain = await client.state.box.wl.value(user1.toString())
    expect(wlRemain).toBe(5n - qty)
  })

  test('anyone can unfreeze but only after unfreezeTime', async () => {
    const { testAccount } = localnet.context
    const { client, user1 } = await deploy(testAccount)

    const { revenueAddress, algoPrice, sellingAsset, assetPrice, purchaseAsset } = await client.state.global.getAll()
    const userClient = client.clone({ defaultSender: user1 })

    await userClient
      .newGroup()
      // opt in to asset
      .addTransaction(
        await client.algorand.createTransaction.assetOptIn({
          sender: user1,
          assetId: sellingAsset!,
        }),
      )
      .buy({
        args: {
          txn: await client.algorand.createTransaction.payment({
            sender: user1,
            receiver: revenueAddress!,
            amount: algoPrice!.microAlgo(),
          }),
        },
        extraFee: (2000).microAlgo(),
      })
      .send()

    const { assets } = await localnet.algorand.account.getInformation(user1)
    const soldAsset = assets!.find(({ assetId }) => assetId === sellingAsset)

    expect(soldAsset?.isFrozen).toBe(true)

    const unfreezeEarly = userClient.send.unfreeze({
      args: { account: user1.toString() },
      extraFee: (1000).microAlgo(),
    })
    await expect(unfreezeEarly).rejects.toThrow(/ERR:UNAUTH/)

    // change unfreeze time
    const config = {
      algoPrice: algoPrice!,
      assetPrice: assetPrice!,
      purchaseAsset: purchaseAsset!,
      revenueAddress: revenueAddress!,
      sellingAsset: sellingAsset!,
      unfreezeTime: 1n,
    }
    await client.send.setConfig({
      args: {
        config,
      },
    })

    await userClient.send.unfreeze({
      args: { account: user1.toString() },
      extraFee: (1000).microAlgo(),
    })

    const { assets: assets2 } = await localnet.algorand.account.getInformation(user1)
    const soldAsset2 = assets2!.find(({ assetId }) => assetId === sellingAsset)

    expect(soldAsset2?.isFrozen).toBe(false)
  })
})
