import axios from 'axios'
import { EverpayInfo, EverpayTransaction } from '../global'
import { GetEverpayBalanceParams, GetEverpayBalanceResult, PostEverpayTxParams, PostEverpayTxResult } from './interface'

const rConfig = {
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.128 Safari/537.36'
  }
}

export const getEverpayInfo = async (apiHost: string): Promise<EverpayInfo> => {
  const url = `${apiHost}/info`
  const result = await axios({
    ...rConfig,
    url,
    method: 'GET'
  })
  return result.data
}

export const getEverpayBalance = async (apiHost: string, {
  chainType,
  symbol,
  id,
  account
}: GetEverpayBalanceParams): Promise<GetEverpayBalanceResult> => {
  const url = `${apiHost}/balanceOf/${chainType}-${symbol}-${id}/${account}`
  const result = await axios({
    ...rConfig,
    url,
    method: 'GET'
  })
  return result.data
}

export const getEverpayTransactions = async (apiHost: string, account?: string): Promise<EverpayTransaction[]> => {
  const url = account !== undefined ? `${apiHost}/txs/${account}` : `${apiHost}/txs/`
  const result = await axios({
    ...rConfig,
    url,
    method: 'GET'
  })
  return result.data.txs
}

export const postTx = async (apiHost: string, params: PostEverpayTxParams): Promise<PostEverpayTxResult> => {
  const url = `${apiHost}/tx`
  const result = await axios({
    ...rConfig,
    url,
    method: 'POST',
    data: params
  })
  return result.data
}
