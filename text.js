const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { google } = require("googleapis");
const TransactionItem = require("./model/transactionItem");
const CategoryItem = require("./model/categoryItem");
const sheets = google.sheets("v4");
const fs = require("fs");
const { formatDateTime, capitalizeFirstLetter } = require("./helper/helper");
const secret = require("./secret");
const CREDENTIALS = JSON.parse(fs.readFileSync("credentials.json"));
const SPREADSHEET_ID = secret["default-sheet-id"];
const ADMIN_SPREADSHEET_ID = secret["admin-sheet-id"];
const client = new Client({
  authStrategy: new LocalAuth(),
});

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

async function addTransaction(data) {
  const inputRange = data.type === "out" ? "Cashflow!B:F" : "Cashflow!H:L";

  const client = await auth.getClient();
  const request = {
    spreadsheetId: SPREADSHEET_ID,
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

async function editConfig(data) {
  let column;
  if (data.type === "Category") {
    const baseCategory = await getConfig("category");
    column = `Config!C${baseCategory.length + 2}`;
  } else {
    const baseSource = await getConfig("source");
    column = `Config!B${baseSource.length + 2}`;
  }

  const client = await auth.getClient();
  const request = {
    spreadsheetId: SPREADSHEET_ID,
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

async function sendMessage(transactions, categories, errors, msg) {
  let countTrxSuccess = 0;
  let countTrxFailed = 0;
  let countConfigSuccess = 0;
  let countConfigFailed = 0;
  let message = "";
  for (const transaction of transactions) {
    if (addTransaction(transaction, msg)) {
      countTrxSuccess++;
    } else {
      countTrxFailed++;
    }
  }

  for (const category of categories) {
    if (editConfig(category, msg)) {
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
  }

  msg.reply(message);
}

async function checkMessage(messages) {
  // const phoneNumber = msg.from.replace(/@.*$/, "");
  const regexRegister = /^([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+(.+?)$/;
  const regexOutcome =
    /^([a-zA-Z\s]+)\s+(.+?)\s+([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+(\d+)$/;
  const regexAction =
    /^([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+(.+?)$/;
  const regexSpreadsheetId = /\/d\/([a-zA-Z0-9-_]+)/;
  const baseCategory = await getConfig("category");
  const baseSource = await getConfig("source");
  const baseNumbers = await getConfig("users");
  const baseName = await getConfig("name");
  const baseSheet = await getConfig("sheet");
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

  if (baseNumbers.includes(phoneNumber)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (regexOutcome.test(line)) {
        const baseAction = ["in", "out"];
        const match = line.match(regexOutcome);
        const type = match[1].trim();
        const item = match[2].trim();
        const category = match[3].trim();
        const source = match[4].trim();
        const price = parseInt(match[5], 10);
        const formattedDateTime = formatDateTime(times[i]);
        const capitalizedItem = capitalizeFirstLetter(item).replace(/_/g, ' ');
        const capitalizedCategory = capitalizeFirstLetter(category);
        const capitalizedSource = capitalizeFirstLetter(source);

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
        const category = capitalizeFirstLetter(match[4].trim());
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

    sendMessage(transactionItem, categoryItem, errorItem, lastMessage);

  } else if (regexRegister.test(lines[0])) {
    const match = lines[0].match(regexRegister);
    const name = match[2].trim();
    const id = match[3].trim();
    const spreadsheet = id.match(regexSpreadsheetId);
    await register([phoneNumber, name, spreadsheet[1]], lastMessage, name);
  } else {
    msg.reply(
      `Your phone number is not registered. If you want to register please use "register [name] [your spreadsheet link]"\n\nPlease make sure to keep your name in one word and give me your full spreadsheet link after you copied this template:\n\n"https://docs.google.com/spreadsheets/d/1xPZNMn1BJiL8iXDSrT5OpSjxJQJx1vI8Nzs0HRPAH04/"`
    );
  }
}

client.on('ready', async () => {
  const users = await getConfig("users");
  for (const user of users) {
    let chat = await client.getChatById(`${user}@s.whatsapp.net`);
    let messages = await chat.fetchMessages({ limit: chat.unreadCount, fromMe: false });
    checkMessage(messages);
  }
})

client.on("message", async (msg) => {
  let chat = await msg.getChat();
  let messages = await chat.fetchMessages({ limit: chat.unreadCount, fromMe: false });
  checkMessage(messages);
});

async function getConfig(type) {
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
  let spreadsheetID = "";
  if (type === "category" || type === "source") {
    spreadsheetID = SPREADSHEET_ID;
  } else {
    spreadsheetID = ADMIN_SPREADSHEET_ID;
  }
  try {
    const response = await sheets.spreadsheets.values.get({
      auth: client,
      spreadsheetId: spreadsheetID,
      range: baseRange,
    });

    const values = response.data.values || [];
    const categorySet = new Set();

    values.forEach((row) => {
      const category = row[0];
      if (category) {
        categorySet.add(category);
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
