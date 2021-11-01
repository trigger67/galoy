import { PriceService } from "@services/price"
import { sendNotification } from "./notification"

export const getTitle = {
  "paid-invoice": ({ usd, amount }) => `+$${usd} | ${amount} sats`,
  "onchain_receipt": ({ usd, amount }) => `+$${usd} | ${amount} sats`,
  "onchain_receipt_pending": ({ usd, amount }) => `pending +$${usd} | ${amount} sats`,
  "onchain_payment": ({ amount }) => `Sent onchain payment of ${amount} sats confirmed`,
}

export const getTitleNoUsd = {
  "paid-invoice": ({ amount }) => `+${amount} sats`,
  "onchain_receipt": ({ amount }) => `+${amount} sats`,
  "onchain_receipt_pending": ({ amount }) => `pending +${amount} sats`,
  "onchain_payment": ({ amount }) => `Sent onchain payment of ${amount} sats confirmed`,
}

export const transactionNotification = async ({
  amount,
  type,
  user,
  logger,
  hash,
  txid,
}: IPaymentNotification) => {
  let title = getTitleNoUsd[type]({ amount })
  const satsPrice = await PriceService().getCurrentPrice()
  if (!(satsPrice instanceof Error)) {
    const usd = (amount * satsPrice).toFixed(2)
    title = getTitle[type]({ usd, amount })
  }

  const data: IDataNotification = {
    type: type as TransactionType,
    hash, // offchain
    amount,
    txid, // onchain ... use the same property? txid have an index as well
  }

  await sendNotification({ title, user, logger, data })
}
