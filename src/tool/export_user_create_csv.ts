import {User, setupMongoConnection} from "../mongodb"
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// need to set MONGODB_ADDRESS to call the script
// ie: MONGODB_ADDRESS=localhost ts-node export_user_create_csv.ts

const main = async () => {
  await setupMongoConnection()

  console.log("main")

  let users

  try {
    users = await User.find({"phone": {"$exists": 1}})
  } catch (err) {
    console.log(err)
  }

  console.log("csvWriter")
  const csvWriter = createCsvWriter({
    path: 'records.csv',
    header: [
        {id: 'phone', title: 'Phone'},
        {id: 'amount', title: 'Amount'},
        {id: 'memo', title: 'Memo'},
    ]
  });

  const records: any[] = []

  for (const user of users) {
    records.push({
      phone: user.phone
    })
  }

  console.log(records)
  await csvWriter.writeRecords(records)
}

main().then(o => console.log(o)).catch(err => console.log(err))
console.log("end")