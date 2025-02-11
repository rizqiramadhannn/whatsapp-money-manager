const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { google } = require("googleapis");
const TransactionItem = require("./model/transactionItem");
const CategoryItem = require("./model/categoryItem");
const sheets = google.sheets("v4");
const fs = require("fs");
const { formatDateTime, capitalizeFirstLetter, getGreeting } = require("./helper/helper");
const secret = require("./secret");
const CREDENTIALS = JSON.parse(fs.readFileSync("credentials.json"));
const SPREADSHEET_ID = secret["default-sheet-id"];
const ADMIN_SPREADSHEET_ID = secret["admin-sheet-id"];
const client = new Client({
  authStrategy: new LocalAuth(),
});
const timer = 5;

const auth = new google.auth.GoogleAuth({
  credentials: CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("QR code generated, scan it with your WhatsApp app.");
});

client.on("ready", () => {
  console.log("Client is ready!");
});

async function addTransaction(data, sheetId) {
  const inputRange = data.type === "out" ? "Cashflow!B:F" : "Cashflow!H:L";

  const client = await auth.getClient();
  const request = {
    spreadsheetId: sheetId,
    range: inputRange,
    valueInputOption: "RAW",
    resource: {
      values: [data.toArray()],
    },
    auth: client,
  };

  try {
    const response = await sheets.spreadsheets.values.append(request);
    if (response.status === 200) {
      console.log("Data successfully appended to the sheet:", response.data);
      return true;
    } else {
      console.log("Failed to append data to sheet. Status:", response.status);
      return false;
    }
  } catch (error) {
    console.error("Error appending data to sheet:", error);
    return false;
  }
}

async function editConfig(data, sheetId) {
  let column;
  if (data.type === "Category") {
    const baseCategory = await getConfig("category", sheetId);
    column = `Config!C${baseCategory.length + 2}`;
  } else {
    const baseSource = await getConfig("source", sheetId);
    column = `Config!B${baseSource.length + 2}`;
  }

  const client = await auth.getClient();
  const request = {
    spreadsheetId: sheetId,
    range: column,
    valueInputOption: "RAW",
    resource: {
      values: [data.toArray()],
    },
    auth: client,
  };

  try {
    const response = await sheets.spreadsheets.values.append(request);
    if (response.status === 200) {
      console.log("Data successfully appended to the sheet:", response.data);
      return true;
    } else {
      console.log("Failed to append data to sheet. Status:", response.status);
      return false;
    }
  } catch (error) {
    console.error("Error appending data to sheet:", error);
    return false;
  }
}

async function register(data, msg, name) {
  const client = await auth.getClient();
  const request = {
    spreadsheetId: ADMIN_SPREADSHEET_ID,
    range: "Accounts!A:C",
    valueInputOption: "RAW",
    resource: {
      values: [data],
    },
    auth: client,
  };

  try {
    await sheets.spreadsheets.values.append(request);
    msg.reply(
      `You have successfully registered! I hope you like the app ${name}\n\nTo finish the config, please add "whatsapp-admin@moneymanager-447316.iam.gserviceaccount.com" to your spreadsheet as editor.\n\nIf you have any suggestion or encountered a bug, please contact me at https://whatsapp.me/+6285229952534`
    );
    console.log("New user registered: ", data);
  } catch (error) {
    msg.reply("Failed to write to sheet:", error);
    console.error("Error appending data to sheet:", error);
  }
}

async function sendMessage(transactions, categories, errors, msg, sheetId, sendTo) {
  let countTrxSuccess = 0;
  let countTrxFailed = 0;
  let countConfigSuccess = 0;
  let countConfigFailed = 0;
  let message = "";
  for (const transaction of transactions) {
    if (addTransaction(transaction, sheetId)) {
      countTrxSuccess++;
    } else {
      countTrxFailed++;
    }
  }

  for (const category of categories) {
    if (editConfig(category, sheetId)) {
      countConfigSuccess++
    } else {
      countConfigFailed++;
    }
  }

  if (countTrxSuccess > 0) {
    message += `${countTrxSuccess} transaction successfully added\n\n`
  }

  if (countTrxFailed > 0) {
    message += `${countTrxFailed} transaction fail to added\n\n`
  }

  if (countConfigSuccess > 0) {
    message += `${countConfigSuccess} config successfully added\n\n`
  }

  if (countConfigFailed > 0) {
    message += `${countConfigFailed} config fail to added\n\n`
  }

  if (errors.length > 0) {
    message += `${errors.length} message error:\n`;
    for (const error of errors) {
      message += `${error}`;
    }
    message += `\nPlease make sure to use the correct format`
  } else {
    message = message.trimEnd();
  }

  sendMessageWithTimeout(sendTo, message);
}

function sendMessageWithTimeout(sendTo, message) {
  let timeoutId;
  let lastMessage;
  let isSending = false;
  lastMessage = message;

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (isSending) {
    return;
  }

  isSending = true;

  client.sendMessage(sendTo, lastMessage)
    .then(() => {
      timeoutId = setTimeout(() => {
        isSending = false;
        client.sendMessage(sendTo, `It looks like you don't have any more transaction to process right now. Feel free to send a message whenever you need!`)
          .then(() => {
            console.log("Message sent again after 30 seconds!");
          })
          .catch((error) => {
            console.error("Failed to send the message again:", error);
          });
      }, 30000);
    })
    .catch((error) => {
      console.error("Failed to send the initial message:", error);
      isSending = false;
    });
}

async function checkMessage(messages, user = '') {
  // const phoneNumber = msg.from.replace(/@.*$/, "");
  const regexRegister = /^([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+(.+?)$/;
  const regexOutcome = /^([a-zA-Z\s]+)\s+(.+?)\s+(.+?)\s+(.+?)\s+(\d+)$/;
  const regexAction = /^([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+(.+?)$/;
  const regexSpreadsheetId = /\/d\/([a-zA-Z0-9-_]+)/;
  const regexHelp = /^\.$|^hi$/;
  const baseName = await getConfig("name", ADMIN_SPREADSHEET_ID);
  const baseSheet = await getConfig("sheet", ADMIN_SPREADSHEET_ID);
  const users = await getConfig("users", ADMIN_SPREADSHEET_ID);
  let lines = [];
  let times = [];
  let transactionItem = [];
  let categoryItem = [];
  let errorItem = [];
  let phoneNumber = "";
  let lastMessage = messages[messages.length - 1];
  for (const message of messages) {
    phoneNumber = message.from.replace(/@.*$/, "");
    const messageLines = message.body.split("\n");
    lines.push(...messageLines);
    times.push(...Array(messageLines.length).fill(message.timestamp));
  }
  let index = users.indexOf(phoneNumber);
  if (user != '') {
    index = users.indexOf(user);
  }
  let sheetId = baseSheet[index];
  const baseCategory = await getConfig("category", sheetId);
  const baseSource = await getConfig("source", sheetId);
  const sendTo = `${phoneNumber}@s.whatsapp.net`;
  if (users.includes(phoneNumber)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (regexHelp.test(line)) {
        const content = `${getGreeting()}, ${baseName[index]}.\nTo manage your cash flow, please use the following formats:\n- *Add a new transaction:* \`\`\`[in/out] [transaction_name] [category] [source] [amount]\`\`\`\n- *Add a new configuration:* \`\`\`[config] [category/source] add [item_name]\`\`\`\n\n*Available categories:*\n${baseCategory.map(category => `- ${category}`).join('\n')}\n\n*Sources of funds:*\n${baseSource.map(source => `- ${source}`).join('\n')}`;
        client.sendMessage(sendTo, content)
        return;
      } else if (regexOutcome.test(line)) {
        const baseAction = ["in", "out"];
        const match = line.match(regexOutcome);
        const type = match[1].trim();
        const item = match[2].trim();
        const category = match[3].trim();
        const source = match[4].trim();
        const price = parseInt(match[5], 10);
        const formattedDateTime = formatDateTime(times[i]);
        const capitalizedItem = capitalizeFirstLetter(item).replace(/_/g, ' ');
        const capitalizedCategory = capitalizeFirstLetter(category).replace(/_/g, ' ');;
        const capitalizedSource = capitalizeFirstLetter(source).replace(/_/g, ' ');;

        if (!baseCategory.includes(capitalizedCategory)) {
          errorItem.push(
            `- Invalid category "${capitalizedCategory}" at line "${line}".\n`
          );
        } else if (!baseSource.includes(capitalizedSource)) {
          errorItem.push(
            `- Invalid source "${capitalizedSource}" at line "${line}".\n`
          );
        } else if (!baseAction.includes(type)) {
          errorItem.push(
            `- Invalid action "${type}" at line "${line}".\n`
          );
        } else {
          const item = new TransactionItem(
            formattedDateTime,
            capitalizedItem,
            capitalizedCategory,
            capitalizedSource,
            price,
            type
          );
          transactionItem.push(item);
        }
      } else if (regexAction.test(line)) {
        const match = line.match(regexAction);
        const type = capitalizeFirstLetter(match[2].trim());
        const action = match[3].trim();
        const category = capitalizeFirstLetter(match[4].trim()).replace(/_/g, ' ');
        console.log(category);
        console.log(type);

        if (type !== "Category" && type !== "Source") {
          errorItem.push(
            `- Invalid type "${type}" at line "${line}".\n`
          );
        } else {
          const item = new CategoryItem(
            category,
            type
          );
          categoryItem.push(item);
        }
      } else {
        errorItem.push(
          `- Invalid format at "${line}".\n`
        );
      }
    }

    sendMessage(transactionItem, categoryItem, errorItem, lastMessage, sheetId, sendTo);

  } else if (regexRegister.test(lines[0])) {
    const match = lines[0].match(regexRegister);
    const name = match[2].trim();
    const id = match[3].trim();
    const spreadsheet = id.match(regexSpreadsheetId);
    await register([phoneNumber, name, spreadsheet[1]], lastMessage, name);
  } else {
    // msg.reply(
    //   `Your phone number is not registered. If you want to register please use "register [name] [your spreadsheet link]"\n\nPlease make sure to keep your name in one word and give me your full spreadsheet link after you copied this template:\n\n"https://docs.google.com/spreadsheets/d/1xPZNMn1BJiL8iXDSrT5OpSjxJQJx1vI8Nzs0HRPAH04/"`
    // );
  }
}

client.on('ready', async () => {
  const users = await getConfig("users", ADMIN_SPREADSHEET_ID);
  for (const user of users) {
    let chat = await client.getChatById(`${user}@s.whatsapp.net`);
    let messages = await chat.fetchMessages({ limit: chat.unreadCount, fromMe: false });
    checkMessage(messages, user);
  }
})

client.on("message", async (msg) => {
  let chat = await msg.getChat();
  console.log(chat);

  let messages = await chat.fetchMessages({ limit: 1, fromMe: false });
  checkMessage(messages);
});

async function getConfig(type, sheetId) {
  let baseRange = "";
  switch (type) {
    case "category":
      baseRange = "Config!C:C";
      break;
    case "source":
      baseRange = "Config!B:B";
      break;
    case "users":
      baseRange = "Accounts!A:A";
      break;
    case "name":
      baseRange = "Accounts!B:B";
      break;
    case "sheet":
      baseRange = "Accounts!C:C";
      break;
    default:
      return "";
  }
  const client = await auth.getClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      auth: client,
      spreadsheetId: sheetId,
      range: baseRange,
    });

    const values = response.data.values || [];
    const categorySet = new Set();

    values.forEach((row) => {
      const category = row[0];
      if (category) {
        if (type == "category" || type == "source") {
          categorySet.add(capitalizeFirstLetter(category.toLowerCase()));
        } else {
          categorySet.add(category);
        }
      }
    });

    const combinedCategories = Array.from(categorySet);
    if (combinedCategories.length > 0) {
      combinedCategories.shift();
    }
    console.log(combinedCategories);
    return combinedCategories;
  } catch (error) {
    console.error("Error reading from Google Sheets:", error);
  }
}

client.initialize();

exports.handler = async (event, context) => {
  const msg = JSON.parse(event.body);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Function executed successfully!" }),
  };
};
