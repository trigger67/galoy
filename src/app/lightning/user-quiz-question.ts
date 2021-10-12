import { addInvoice, lnInvoicePaymentSend } from "@app/wallets"
import { onboardingEarn } from "@config/app"
import { toSats } from "@domain/bitcoin"
import { LockService } from "@services/lock"
import { AccountsRepository, UsersRepository } from "@services/mongoose"

export const updateUserQuizQuestionCompleted = async ({
  questionId,
  userId,
  logger,
}: {
  questionId: QuizQuestionId
  userId: UserId
  logger: Logger
}): Promise<UserQuizQuestion | ApplicationError> => {
  // Check user voip number

  const usersRepo = UsersRepository()

  const lightningFundingUser = await UsersRepository().findByRole("funder" as UserRole)
  if (lightningFundingUser instanceof Error) return lightningFundingUser
  const lightningFundingAccount = await AccountsRepository().findById(
    lightningFundingUser.defaultAccountId,
  )
  if (lightningFundingAccount instanceof Error) return lightningFundingAccount
  const lightningFundingWalletId = lightningFundingAccount.walletIds[0]

  return LockService().lockUserId({ userId, logger }, async () => {
    const amount = onboardingEarn[questionId]
    const quizQuestion: UserQuizQuestion = {
      question: {
        id: questionId as QuizQuestionId,
        earnAmount: toSats(amount),
      },
      completed: true,
    }

    const user = await usersRepo.findById(userId)
    if (user instanceof Error) return user

    const completedQuestionIds = user.quizQuestions.map(
      (quizQuestion) => quizQuestion.question.id,
    )
    if (!completedQuestionIds.includes(questionId)) {
      // Pay user
      const account = await AccountsRepository().findById(user.defaultAccountId)
      if (account instanceof Error) return account
      const walletId = account.walletIds[0]
      // FIXME: use pay by username instead
      const lnInvoice = await addInvoice({
        walletId,
        amount,
        memo: questionId,
      })
      if (lnInvoice instanceof Error) return lnInvoice

      const payResult = await lnInvoicePaymentSend({
        paymentRequest: lnInvoice.paymentRequest,
        memo: null,
        walletId: lightningFundingWalletId,
        userId: lightningFundingUser.id,
        logger,
      })
      if (payResult instanceof Error) return payResult

      // Update user
      user.quizQuestions.push(quizQuestion)
      const updated = await usersRepo.update(user)
      if (updated instanceof Error) return updated
    }
    return quizQuestion
  })
}
