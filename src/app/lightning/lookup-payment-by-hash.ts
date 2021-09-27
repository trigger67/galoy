import { LndService } from "@services/lnd"

export const lookupPaymentByHash = async (
  pubkey: Pubkey,
  paymentHash: PaymentHash,
): Promise<LnPaymentLookup | ApplicationError> => {
  const lndService = LndService()
  if (lndService instanceof Error) return lndService

  return lndService.lookupPayment({
    pubkey,
    paymentHash,
  })
}
