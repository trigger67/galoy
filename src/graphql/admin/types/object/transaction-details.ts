import { GT } from "@graphql/index"
import ITransaction from "@graphql/types/abstract/transaction"
import LightningPayment from "./lightning-payment"

const TransactionDetails = new GT.Object({
  name: "TransactionDetails",
  fields: () => ({
    ledgerTxs: {
      type: GT.List(ITransaction),
    },
    lightningPayment: { type: LightningPayment },
  }),
})

export default TransactionDetails
