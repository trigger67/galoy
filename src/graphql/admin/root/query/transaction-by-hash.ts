import { GT } from "@graphql/index"
import * as Wallets from "@app/wallets"
import { lookupPaymentByHash } from "@app/lightning"
import { SettlementMethod } from "@domain/wallets"
import TransactionDetails from "@graphql/admin/types/object/transaction-details"

const TransactionByHashQuery = GT.Field({
  type: GT.NonNull(TransactionDetails),
  args: {
    hash: { type: GT.NonNull(GT.String) },
  },
  resolve: async (_, { hash }) => {
    if (hash instanceof Error) throw hash

    const ledgerTxs = await Wallets.getTransactionsByHash(hash)
    if (ledgerTxs instanceof Error) throw ledgerTxs

    let lightningPayment: LnPaymentLookup | null = null
    if (ledgerTxs[0] && ledgerTxs[0].settlementVia === SettlementMethod.Lightning) {
      const tx = ledgerTxs[0] as WalletLnTransaction
      const lnLookup = await lookupPaymentByHash(tx.pubkey, tx.paymentHash)
      if (!(lnLookup instanceof Error)) lightningPayment = lnLookup
    }

    //TODO: query onchain

    return {
      ledgerTxs,
      lightningPayment,
    }
  },
})

export default TransactionByHashQuery
