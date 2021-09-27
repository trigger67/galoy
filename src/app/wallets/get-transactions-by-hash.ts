import { LedgerService } from "@services/ledger"
import { WalletTransactionHistory } from "@domain/wallets"

export const getTransactionsByHash = async (
  paymentHash: PaymentHash,
): Promise<WalletTransaction[] | ApplicationError> => {
  const ledger = LedgerService()
  const ledgerTransactions = await ledger.getTransactionsByHash(paymentHash)
  if (ledgerTransactions instanceof Error) return ledgerTransactions
  return WalletTransactionHistory.fromLedger(ledgerTransactions).transactions
}
