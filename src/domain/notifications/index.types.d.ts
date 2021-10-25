type NotificationsError = import("./errors").NotificationsError
type NotificationsServiceError = import("./errors").NotificationsServiceError

type OnChainTxReceivedArgs = {
  walletId: WalletId
  amount: Satoshis
  txHash: OnChainTxHash
}

type LnPaymentReceivedArgs = {
  walletId: WalletId
  amount: Satoshis
  paymentHash: PaymentHash
}

interface INotificationsService {
  onChainTransactionReceived(
    args: OnChainTxReceivedArgs,
  ): Promise<void | NotificationsServiceError>
  lnPaymentReceived(
    args: LnPaymentReceivedArgs,
  ): Promise<void | NotificationsServiceError>
}
