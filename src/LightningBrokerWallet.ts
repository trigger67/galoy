import { find } from "lodash";
import { LightningMixin } from "./Lightning";
import { MainBook } from "./mongodb";
import { OnChainMixin } from "./OnChain";
import { Price } from "./priceImpl";
import { ILightningWalletUser } from "./types";
import { btc2sat, sat2btc, sleep } from "./utils";
import { brokerAccountPath } from "./wallet";
const using = require('bluebird').using
const util = require('util')
const ccxt = require('ccxt')
const assert = require('assert')

const apiKey = process.env.FTX_KEY
const secret = process.env.FTX_SECRET

const LOW_BOUND_EXPOSURE = 0.8
const LOW_SAFEBOUND_EXPOSURE = 0.9
const HIGH_SAFEBOUND_EXPOSURE = 1.1
const HIGH_BOUND_EXPOSURE = 1.2

const LOW_BOUND_LEVERAGE = 1
const LOW_SAFEBOUND_LEVERAGE = 1.20
const HIGH_SAFEBOUND_LEVERAGE = 1.66
const HIGH_BOUND_LEVERAGE = 2

const symbol = 'BTC-PERP'


export class BrokerWallet {
  readonly uid: string
  readonly currency: string

  constructor({uid, currency}) {
    this.uid = uid
    this.currency = currency
  }

  get accountPath(): string {
    return brokerAccountPath
  }

  async getBalance() {

    const { balance } = await MainBook.balance({
      account: this.accountPath,
      currency: this.currency, 
    })

    return - balance
  }
}


export class LightningBrokerWallet extends OnChainMixin(BrokerWallet) {
  readonly currency = "BTC" 
  ftx
  price

  constructor({ uid }: ILightningWalletUser) {
    super({ uid, currency: "BTC" })
    this.ftx = new ccxt.ftx({ apiKey, secret })
    this.price = new Price()
  }

  async getLocalLiabilities() { 
    const { balance: usd } = await MainBook.balance({
      account: this.accountPath,
      currency: "USD", 
    })

    const { balance: sats } = await MainBook.balance({
      account: this.accountPath,
      currency: "BTC", 
    })

    return { 
      usd,
      sats
    }
  }

  async has() {
    return this.ftx.has
  }

  async createDepositAddress() {
    // create a new address
    // is not enabled on FTX
    // return this.ftx.createDepositAddress("BTC")
    return Error('not implemented')
  }

  async exchangeDepositAddress() {
    // same address is returned each time
    const { address } = await this.ftx.fetchDepositAddress("BTC")
    return address
  }

  async satsBalance() {
    const { sats: nodeLiabilities } = await this.getLocalLiabilities();
    const node = - nodeLiabilities

    // at least on FTX. interest will be charged when below -$30,000.
    // TODO: manage this part

    const {BTC: exchangeBTC} = await this.getExchangeBalance()
    const exchange = btc2sat(exchangeBTC)

    const total = node + exchange

    return {
      total,
      node,
      exchange
    }
  }

  async getExchangeBalance() {
    const balance = await this.ftx.fetchBalance()

    // TODO do not return only balance?
    return balance.total
    
  }

  async getAccountPosition() {
    const satsPrice = await this.price.lastPrice()
    // FIXME this helper function is inverse?
    // or because price = usd/btc, usd/sats, sat or btc are in the denominator
    // and therefore the "inverse" make sense...?
    const btcPrice = btc2sat(satsPrice) 

    // TODO: what is being returned if no order had been placed?
    // probably an empty array

    const { result: { collateral, positions, chargeInterestOnNegativeUsd, marginFraction } } = await this.ftx.privateGetAccount()
    // console.log(util.inspect({ result }, { showHidden: false, depth: null }))

    const positionBtcPerp = find(positions, { future: symbol} )
    console.log({positionBtcPerp})

    const { netSize, estimatedLiquidationPrice, collateralUsed, maintenanceMarginRequirement } = positionBtcPerp

    // TODO: check this is the intended settings
    assert(chargeInterestOnNegativeUsd == true)

    assert(netSize <= 0)

    return {
      // making netSize positive to simplify calculation
      // we should always be short so netSize should initially 
      // always be negative
      btc: - netSize,

      // btc2sats because BTC is in the denominator... this is confusing.
      usd: - netSize * btcPrice,
      estimatedLiquidationPrice,
      collateralUsed, // USD
      maintenanceMarginRequirement, // start at 0.03 but increase with position side 
      collateral,
      leverage : 1 / marginFraction
    }
  }

  async getExposureRatio() {
    const {usd: usdLiability} = await this.getLocalLiabilities()
    const {usd: usdExposure} = await this.getAccountPosition()

    return {
      ratio: usdLiability / usdExposure,
      diff: usdLiability - usdExposure
    }
  }

  // we need to rebalance when price is increasing/decreasing.
  // if price increase, then the short position risk being liquidated
  // so we need to sned btc from the node to the exchange
  // if price decrease, then there would be too much btc on the exchange
  // the account won't be at the irsk of being liquidated in this case
  // but then the custody risk of the exchange increases
  isRebalanceNeeded({leverage, usdCollateral, btcPrice}) {

    let btcAmount, usdAmountDiff
    let depositOrWithdraw = null

    const usdLeveraged = usdCollateral * leverage

    try {
      // leverage is too low
      // no imminent risk (beyond exchange custory risk)
      if (leverage < LOW_BOUND_LEVERAGE) {
        const targetUsdCollateral = usdCollateral * LOW_SAFEBOUND_LEVERAGE
        usdAmountDiff = targetUsdCollateral - usdLeveraged
        depositOrWithdraw = "withdraw"
      }

      // overexposed
      // short
      // will loose money if BTCUSD price increase
      else if (leverage > HIGH_BOUND_LEVERAGE) {
        const targetUsdCollateral = usdCollateral * HIGH_SAFEBOUND_LEVERAGE
        usdAmountDiff = usdLeveraged - targetUsdCollateral
        depositOrWithdraw = "deposit"
      }

    } catch (err) {
      throw Error("can't calculate rebalance")
    }

    btcAmount = usdAmountDiff * btcPrice
    assert(btcAmount > 0)
    // amount more than 50% of the collateral should not happen
    assert(btcAmount < .5 * usdCollateral * btcPrice)

    return { btcAmount, depositOrWithdraw }
  }

  // we need to have an order when USD balance of the broker changes.
  // ie: when someone has sent/receive sats from their account
  isOrderNeeded({ ratio, usdLiability, usdExposure, satsPrice }) {

    let usdOrderAmount, btcAmount
    let buyOrSell = null

    try {
      // undercovered (ie: have BTC not covered)
      // long
      // will loose money if BTCUSD price drops
      if (ratio < LOW_BOUND_EXPOSURE) {
        const targetUsd = usdLiability * LOW_SAFEBOUND_EXPOSURE
        usdOrderAmount = targetUsd + usdExposure
        buyOrSell = "sell"
      }

      // overexposed
      // short
      // will loose money if BTCUSD price increase
      else if (ratio > HIGH_BOUND_EXPOSURE) {
        const targetUsd = usdLiability * HIGH_SAFEBOUND_EXPOSURE
        usdOrderAmount = - (targetUsd + usdExposure)
        buyOrSell = "buy"
      }

    } catch (err) {
      throw Error("can't calculate hedging value")
    }

    btcAmount = sat2btc(usdOrderAmount * satsPrice)

    assert(btcAmount > 0)
    // assert(usdOrderAmount < usdLiability)
    // TODO: should be reduce only

    return { btcAmount, buyOrSell }
  }


  async executeOrder({ buyOrSell, btcAmount }) {

    // let orderId = 6103637365
    let orderId

    // TODO add: try/catch
    const order = await this.ftx.createOrder(symbol, 'market', buyOrSell, btcAmount)

    // FIXME: have a better way to manage latency
    // ie: use a while loop and check condition for a couple of seconds.
    // or rely on a websocket
    await sleep(1000)

    const result = await this.ftx.fetchOrder(order.id)

    if (result.status !== "closed") {
      console.warn("market order has not been fullfilled")
      // Pager
    }

    // TODO: check we are back to low_safebound
  }

  // TODO: cron job on this
  async updatePositionAndLeverage() {
    const satsPrice = await this.price.lastPrice()
    const btcPrice = btc2sat(satsPrice) 

    const {usd: usdLiability} = await this.getLocalLiabilities()
    const {usd: usdExposure, leverage, collateral} = await this.getAccountPosition()
    const {ratio} = await this.getExposureRatio()

    {
      const { btcAmount, buyOrSell } = this.isOrderNeeded({ ratio, usdLiability, usdExposure, satsPrice })

      if (buyOrSell) {
        await this.executeOrder({ btcAmount, buyOrSell })
      }
    }

    {
      const { btcAmount, depositOrWithdraw } = this.isRebalanceNeeded({ leverage, usdCollateral: collateral, btcPrice })
      // deposit and withdraw are from the exchange point of view
      if (depositOrWithdraw === "withdraw") {
        const address = await this.getOnChainAddress()
        await this.ftx.withdraw("BTC", btcAmount, address)
      } else if (depositOrWithdraw === "deposit") {
        const description = `deposit of ${btcAmount} btc to ${this.ftx.name}`
        const address = await this.exchangeDepositAddress()
        await this.onChainPay({address, amount: btcAmount, description})
      }
    }

  }
}