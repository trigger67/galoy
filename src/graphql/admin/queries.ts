import { GT } from "@graphql/index"

import AllLevelsQuery from "./root/query/all-levels"
import UserDetailsByPhoneQuery from "./root/query/user-details-by-phone"
import UserDetailsByWalletNameQuery from "./root/query/user-details-by-wallet-name"
import TransactionByHashQuery from "./root/query/transaction-by-hash"

const QueryType = new GT.Object({
  name: "Query",
  fields: () => ({
    allLevels: AllLevelsQuery,
    userDetailsByPhone: UserDetailsByPhoneQuery,
    userDetailsByWalletName: UserDetailsByWalletNameQuery,
    transactionByHash: TransactionByHashQuery,
  }),
})

export default QueryType
