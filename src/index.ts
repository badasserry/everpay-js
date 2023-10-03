import { getEverpayTxMessage, signMessageAsync, transferAsync, verifySigAsync } from './lib/sign'
import { getEverpayBalance, getEverpayBalances, getEverpayInfo, getEverpayTransaction, getEverpayTransactions, getExpressInfo, getMintdEverpayTransactionByChainTxHash, postTx, getFees, getFee } from './api'
import { everpayTxVersion, getExpressHost, getEverpayHost } from './config'
import { getTimestamp, toBN, getAccountChainType, fromDecimalToUnit, genTokenTag, matchTokenTag, genExpressData, fromUnitToDecimalBN, genBundleData, getTokenBurnFeeByChainType, getChainDecimalByChainType, isArweaveChainPSTMode, getTokenByTag, isArweaveL2PSTTokenSymbol } from './utils/util'
import { GetEverpayBalanceParams, GetEverpayBalancesParams, GetEverpayTransactionsParams } from './types/api'
import { checkParams } from './utils/check'
import { ERRORS } from './utils/errors'
import { utils } from 'ethers'
import { v4 as uuidv4 } from 'uuid'
import {
  Config,
  EverpayInfo,
  EverpayBase,
  BalanceParams,
  BalancesParams,
  DepositParams,
  SendEverpayTxResult,
  TransferParams,
  WithdrawParams,
  EverpayTxWithoutSig,
  EverpayAction,
  BundleData,
  FeeItem,
  ChainType,
  BalanceItem,
  TxsParams,
  TxsByAccountParams,
  TxsResult,
  EverpayTransaction,
  Token,
  EthereumTransaction,
  ArweaveTransaction,
  ExpressInfo,
  CachedInfo,
  InternalTransferItem,
  BundleDataWithSigs,
  BundleParams,
  EverpayTx,
  AddTokenSet,
  NewToken, SetParams, TargetChainMeta, AddTargetChainSet, TokenDisplaySet, OwnershipSet
} from './types'

export * from './types'
class Everpay extends EverpayBase {
  constructor (config?: Config) {
    super()
    this._config = {
      ...config,
      account: config?.account ?? '',
      chainType: config?.chainType ?? ChainType.ethereum
    }
    this._apiHost = getEverpayHost(config?.debug)
    this._expressHost = getExpressHost(config?.debug)
    this._cachedInfo = {}
  }

  private readonly _apiHost: string
  private readonly _expressHost: string
  private readonly _config: Config
  private _cachedInfo: CachedInfo

  getAccountChainType = getAccountChainType

  private readonly cacheHelper = async (key: 'everpay' | 'express'): Promise<EverpayInfo | ExpressInfo> => {
    const timestamp = getTimestamp()
    // cache info 3 mins
    if (this._cachedInfo[key]?.value != null &&
      (this._cachedInfo[key] as any).timestamp > timestamp - 3 * 60) {
      return this._cachedInfo[key]?.value as EverpayInfo | ExpressInfo
    }

    if (key === 'everpay') {
      const value = await await getEverpayInfo(this._apiHost)
      this._cachedInfo[key] = { value, timestamp }
    } else if (key === 'express') {
      const value = await await getExpressInfo(this._expressHost)
      this._cachedInfo[key] = { value, timestamp }
    }
    return this._cachedInfo[key]?.value as EverpayInfo | ExpressInfo
  }

  async info (): Promise<EverpayInfo> {
    const result = await this.cacheHelper('everpay')
    return result as EverpayInfo
  }

  async expressInfo (): Promise<ExpressInfo> {
    const result = await this.cacheHelper('express')
    return result as ExpressInfo
  }

  async balance (params: BalanceParams): Promise<string> {
    await this.info()
    const { tag, account } = params
    const acc = account ?? this._config.account as string
    const token = getTokenByTag(tag, this._cachedInfo?.everpay?.value.tokenList)
    checkParams({ account: acc, tag, token })
    const mergedParams: GetEverpayBalanceParams = {
      tokenTag: genTokenTag(token as Token),
      account: acc
    }
    const everpayBalance = await getEverpayBalance(this._apiHost, mergedParams)
    return fromDecimalToUnit(everpayBalance.balance.amount, everpayBalance.balance.decimals)
  }

  async balances (params?: BalancesParams): Promise<BalanceItem[]> {
    const info = await this.info()
    params = (params ?? {}) as BalanceParams
    const { account } = params
    const acc = account ?? this._config.account as string
    checkParams({ account: acc })
    const mergedParams: GetEverpayBalancesParams = {
      account: acc
    }
    const everpayBalances = await getEverpayBalances(this._apiHost, mergedParams)
    const balances = everpayBalances.balances.map(item => {
      const tag = item.tag
      const token = info.tokenList.find(token => token.tag === tag) as Token
      return {
        chainType: token?.chainType,
        symbol: token?.symbol.toUpperCase(),
        tag: token?.tag,
        address: token.id,
        balance: fromDecimalToUnit(item.amount, item.decimals)
      }
    })
    return balances
  }

  private async getMergedTxsParams (params: TxsParams): Promise<GetEverpayTransactionsParams> {
    const { page, tag, action, withoutAction, cursor } = params
    const mergedParams: GetEverpayTransactionsParams = {}
    if (page !== undefined) {
      mergedParams.page = page
    }
    if (cursor !== undefined) {
      mergedParams.cursor = cursor
    }
    if (tag !== undefined) {
      await this.info()
      const token = getTokenByTag(tag, this._cachedInfo?.everpay?.value.tokenList) as Token
      checkParams({ token })
      mergedParams.tokenTag = token.tag
    }
    if (action !== undefined) {
      checkParams({ action })
      mergedParams.action = action
    }
    if (withoutAction !== undefined) {
      mergedParams.withoutAction = withoutAction
    }
    return mergedParams
  }

  async txs (params: TxsParams): Promise<TxsResult> {
    const mergedParams: GetEverpayTransactionsParams = await this.getMergedTxsParams(params)
    return await getEverpayTransactions(this._apiHost, mergedParams)
  }

  async txsByAccount (params: TxsByAccountParams): Promise<TxsResult> {
    checkParams({ account: params.account ?? this._config.account })
    const mergedParams: GetEverpayTransactionsParams = await this.getMergedTxsParams(params)
    mergedParams.account = params.account ?? this._config.account
    return await getEverpayTransactions(this._apiHost, mergedParams)
  }

  async txByHash (everHash: string): Promise<EverpayTransaction> {
    checkParams({ everHash })
    return await getEverpayTransaction(this._apiHost, everHash)
  }

  async mintedTxByChainTxHash (chainTxHash: string): Promise<EverpayTransaction> {
    checkParams({ chainTxHash })
    return await getMintdEverpayTransactionByChainTxHash(this._apiHost, chainTxHash)
  }

  async fees (): Promise<FeeItem[]> {
    return await getFees(this._apiHost)
  }

  async fee (tag: string): Promise<FeeItem> {
    await this.info()
    const token = getTokenByTag(tag, this._cachedInfo?.everpay?.value.tokenList) as Token
    checkParams({ tag, token })
    return await getFee(this._apiHost, genTokenTag(token))
  }

  async deposit (params: DepositParams): Promise<EthereumTransaction | ArweaveTransaction> {
    await this.info()
    const { amount, tag } = params
    const from = this._config.account
    const token = getTokenByTag(tag, this._cachedInfo?.everpay?.value.tokenList) as Token
    const chainType = this._config.chainType
    checkParams({ account: from, tag, token, amount })

    // arweave 上的 PST 充值必须是整数
    if (isArweaveChainPSTMode(token) && chainType === ChainType.arweave && !isArweaveL2PSTTokenSymbol(token.symbol) && parseInt(amount) !== +amount) {
      throw new Error(ERRORS.DEPOSIT_ARWEAVE_PST_MUST_BE_INTEGER)
    }

    const chainDecimal = getChainDecimalByChainType(token, chainType as ChainType)
    const value = utils.parseUnits(toBN(amount).toString(), chainDecimal)

    return await transferAsync(this._config, this._cachedInfo.everpay?.value as EverpayInfo, {
      symbol: token.symbol,
      token,
      from: from ?? '',
      value
    })
  }

  // amount 为实际收款数量
  async getEverpayTxWithoutSig (
    type: 'transfer' | 'withdraw' | 'bundle' | 'set',
    params: TransferParams | WithdrawParams | BundleParams | SetParams
  ): Promise<EverpayTxWithoutSig> {
    await this.info()
    const { tag, amount, fee, quickMode } = params as WithdrawParams
    const token = getTokenByTag(tag, this._cachedInfo?.everpay?.value.tokenList)
    const from = this._config.account as string
    let data = params.data
    let to = params?.to as string
    let decimalFeeBN = toBN(0)
    let decimalOperateAmountBN = toBN(0)
    let action = EverpayAction.transfer

    checkParams({ account: from, tag, token, to })

    if (type === 'transfer') {
      checkParams({ amount })
      action = EverpayAction.transfer
      decimalOperateAmountBN = fromUnitToDecimalBN(amount, token?.decimals ?? 0)
    } else if (type === 'bundle') {
      action = EverpayAction.bundle
      decimalOperateAmountBN = fromUnitToDecimalBN(amount, token?.decimals ?? 0)

      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    } else if (type === 'set') {
      action = EverpayAction.set
      decimalOperateAmountBN = fromUnitToDecimalBN(amount, token?.decimals ?? 0)
    } else if (type === 'withdraw') {
      checkParams({ amount })
      const chainType = (params as WithdrawParams).chainType

      // PST 提现到 arweave 网络必须是整数
      if (isArweaveChainPSTMode(token) && chainType === ChainType.arweave && !isArweaveL2PSTTokenSymbol(token?.symbol as string) && parseInt(amount) !== +amount) {
        throw new Error(ERRORS.PST_WITHDARW_TO_ARWEAVE_MUST_BE_INTEGER)
      }

      const balance = await this.balance({ tag })
      const decimalBalanceBN = fromUnitToDecimalBN(balance, token?.decimals ?? 0)

      // 快速提现
      if (quickMode === true) {
        action = EverpayAction.transfer
        const expressInfo = await this.expressInfo()
        const tokenTag = genTokenTag(token as Token)
        const foundExpressTokenData = expressInfo.tokens.find(t => matchTokenTag(tokenTag, t.tokenTag))
        if (foundExpressTokenData == null) {
          throw new Error(ERRORS.WITHDRAW_TOKEN_NOT_SUPPORT_QUICK_MODE)
        }

        const quickWithdrawLimitBN = fromUnitToDecimalBN(foundExpressTokenData.walletBalance, token?.decimals ?? 0)

        // 快速提现的手续费，只放入 data 字段中
        const quickWithdrawFeeBN = fee !== undefined
          ? fromUnitToDecimalBN(fee, token?.decimals ?? 0)
          : toBN(foundExpressTokenData.withdrawFee)

        // 快速提现的 amount 为全部数量
        decimalOperateAmountBN = fromUnitToDecimalBN(amount, token?.decimals ?? 0).plus(quickWithdrawFeeBN)

        if (decimalOperateAmountBN.gt(decimalBalanceBN)) {
          throw new Error(ERRORS.WITHDRAW_AMOUNT_LESS_THAN_FEE)
        }

        if (decimalOperateAmountBN.gt(quickWithdrawLimitBN)) {
          throw new Error(ERRORS.INSUFFICIENT_QUICK_WITHDRAWAL_AMOUNT)
        }

        const expressData = genExpressData({
          chainType, to, fee: quickWithdrawFeeBN.toString()
        })
        data = data !== undefined ? { ...data, ...expressData } : { ...expressData }

        // to 需要更改为快速提现收款账户
        to = expressInfo.address

        // 普通提现
      } else {
        action = EverpayAction.withdraw

        if (fee !== undefined) {
          decimalFeeBN = fromUnitToDecimalBN(fee, token?.decimals ?? 0)
        } else {
          const feeItem = await getFee(this._apiHost, genTokenTag(token as Token))
          decimalFeeBN = toBN(getTokenBurnFeeByChainType(token as Token, feeItem, chainType) ?? '0')
        }

        const targetChainType = chainType
        data = data !== undefined ? { ...data, targetChainType } : { targetChainType }
        decimalOperateAmountBN = fromUnitToDecimalBN(amount, token?.decimals ?? 0)

        if (decimalOperateAmountBN.plus(decimalFeeBN).gt(decimalBalanceBN)) {
          throw new Error(ERRORS.WITHDRAW_AMOUNT_LESS_THAN_FEE)
        }
      }
    }

    const everpayTxWithoutSig: EverpayTxWithoutSig = {
      tokenSymbol: token?.symbol as string,
      action,
      from,
      to,
      amount: decimalOperateAmountBN.toString(),
      fee: decimalFeeBN.toString(),
      feeRecipient: this._cachedInfo?.everpay?.value.feeRecipient ?? '',
      nonce: Date.now().toString(),
      tokenID: token?.id as string,
      chainType: token?.chainType as string,
      chainID: token?.chainID as string,
      data: data !== undefined ? JSON.stringify(data) : '',
      version: everpayTxVersion
    }
    return everpayTxWithoutSig
  }

  getEverpayTxMessage (everpayTxWithoutSig: EverpayTxWithoutSig): string {
    return getEverpayTxMessage(everpayTxWithoutSig)
  }

  async signedEverpayTx (everpayTxWithoutSig: EverpayTxWithoutSig): Promise<{everpayTx: EverpayTx, everHash: string}> {
    const messageData = getEverpayTxMessage(everpayTxWithoutSig)
    const { sig, everHash } = await signMessageAsync(this._config, messageData)
    const everpayTx = {
      ...everpayTxWithoutSig,
      sig
    }
    return { everpayTx, everHash }
  }

  async sendEverpayTx (everpayTxWithoutSig: EverpayTxWithoutSig): Promise<SendEverpayTxResult> {
    const { everpayTx, everHash } = await this.signedEverpayTx(everpayTxWithoutSig)
    const postEverpayTxResult = await postTx(this._apiHost, everpayTx)
    return {
      ...postEverpayTxResult,
      everpayTx,
      everHash
    }
  }

  async transfer (params: TransferParams): Promise<SendEverpayTxResult> {
    const everpayTxWithoutSig = await this.getEverpayTxWithoutSig('transfer', params)
    return await this.sendEverpayTx(everpayTxWithoutSig)
  }

  async withdraw (params: WithdrawParams): Promise<SendEverpayTxResult> {
    await this.info()
    const to = params.to ?? this._config.account as string
    const everpayTxWithoutSig = await this.getEverpayTxWithoutSig('withdraw', {
      ...params,
      to
    })
    return await this.sendEverpayTx(everpayTxWithoutSig)
  }

  async getBundleData (items: InternalTransferItem[], expiration?: number): Promise<BundleData> {
    await this.info()
    return genBundleData({
      items,
      tokenList: this._cachedInfo.everpay?.value?.tokenList as Token[],
      // 设置 60s 过期
      expiration: expiration ?? Math.round(Date.now() / 1000) + 60
    })
  }

  async signBundleData (bundleData: BundleData | BundleDataWithSigs): Promise<BundleDataWithSigs> {
    const { items, expiration, salt, version } = bundleData
    const { sig } = await signMessageAsync(this._config, JSON.stringify({
      // 只签名这几个字段，并且顺序需要保持一致
      items, expiration, salt, version
    }))
    const sigs = (bundleData as BundleDataWithSigs).sigs != null ? (bundleData as BundleDataWithSigs).sigs : {}
    sigs[this._config.account as string] = sig
    return {
      items, expiration, salt, version, sigs
    }
  }

  async bundle (params: BundleParams): Promise<SendEverpayTxResult> {
    const everpayTxWithoutSig = await this.getEverpayTxWithoutSig('bundle', params)
    return await this.sendEverpayTx(everpayTxWithoutSig)
  }

  async signAddTokenSet (newToken: NewToken): Promise<AddTokenSet> {
    const addToken: AddTokenSet = {
      action: 'addToken',
      operator: this._config.account as string,
      salt: uuidv4(),
      version: 'v1',
      expiration: Math.round(Date.now() / 1000) + 100,
      token: newToken,
      sig: ''
    }
    const { sig } = await signMessageAsync(this._config, JSON.stringify({
      action: addToken.action,
      operator: addToken.operator,
      salt: addToken.salt,
      version: addToken.version,
      expiration: addToken.expiration,
      token: addToken.token
    }))
    addToken.sig = sig
    return addToken
  }

  async signAddTargetChainSet (tokenTag: string, targetChain: TargetChainMeta): Promise<AddTargetChainSet> {
    const addTargetChain: AddTargetChainSet = {
      action: 'addTargetChain',
      operator: this._config.account as string,
      salt: uuidv4(),
      version: 'v1',
      expiration: Math.round(Date.now() / 1000) + 100,
      tokenTag: tokenTag,
      targetChain: targetChain,
      sig: ''
    }
    const { sig } = await signMessageAsync(this._config, JSON.stringify({
      action: addTargetChain.action,
      operator: addTargetChain.operator,
      salt: addTargetChain.salt,
      version: addTargetChain.version,
      expiration: addTargetChain.expiration,
      tokenTag: addTargetChain.tokenTag,
      targetChain: addTargetChain.targetChain
    }))
    addTargetChain.sig = sig
    return addTargetChain
  }

  async signTokenDisplaySet (tokenTag: string, display: boolean): Promise<TokenDisplaySet> {
    const tokenDisplay: TokenDisplaySet = {
      action: 'setTokenDisplay',
      operator: this._config.account as string,
      salt: uuidv4(),
      version: 'v1',
      expiration: Math.round(Date.now() / 1000) + 100,
      tokenTag: tokenTag,
      display: display,
      sig: ''
    }
    const { sig } = await signMessageAsync(this._config, JSON.stringify({
      action: tokenDisplay.action,
      operator: tokenDisplay.operator,
      salt: tokenDisplay.salt,
      version: tokenDisplay.version,
      expiration: tokenDisplay.expiration,
      tokenTag: tokenDisplay.tokenTag,
      display: tokenDisplay.display
    }))
    tokenDisplay.sig = sig
    return tokenDisplay
  }

  async signOwnershipSet (newOwner: string): Promise<OwnershipSet> {
    const ownership: OwnershipSet = {
      action: 'transferOwnership',
      operator: this._config.account as string,
      salt: uuidv4(),
      version: 'v1',
      expiration: Math.round(Date.now() / 1000) + 100,
      newOwner: newOwner,
      sig: ''
    }
    const { sig } = await signMessageAsync(this._config, JSON.stringify({
      action: ownership.action,
      operator: ownership.operator,
      salt: ownership.salt,
      version: ownership.version,
      expiration: ownership.expiration,
      newOwner: ownership.newOwner
    }))
    ownership.sig = sig
    return ownership
  }

  async setTx (setData: any): Promise<SendEverpayTxResult> {
    const setParams: SetParams = { amount: '0', data: setData, symbol: 'eth', to: this._config.account as string }
    const everpayTxWithoutSig = await this.getEverpayTxWithoutSig('set', setParams)
    return await this.sendEverpayTx(everpayTxWithoutSig)
  }

  async verifyTx (tx: EverpayTransaction): Promise<boolean> {
    return await verifySigAsync(tx)
  }
}

export default Everpay
