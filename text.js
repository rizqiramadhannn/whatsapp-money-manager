const { Client, LocalAuth, Chat } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { google } = require("googleapis");
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

async function appendToSheet(data, msg, type) {
  const inputRange = type === "out" ? "Cashflow!B:F" : "Cashflow!H:L";

  const client = await auth.getClient();
  const request = {
    spreadsheetId: SPREADSHEET_ID,
    range: inputRange,
    valueInputOption: "RAW",
    resource: {
      values: [data],
    },
    auth: client,
  };

  try {
    await sheets.spreadsheets.values.append(request);
    msg.reply(
      `Successfully wrote to sheet\n${data[1]} ${data[2]} ${data[3]} ${data[4]}`
    );
    console.log("Data appended to sheet:", data);
  } catch (error) {
    msg.reply("Failed to write to sheet:", error);
    console.error("Error appending data to sheet:", error);
  }
}

async function addSomething(data, msg, type) {
  let column;
  if (type === "Category") {
    const baseCategory = await getConfig("category");
    column = `Config!C${baseCategory.length + 3}`;
  } else if (type === "Source") {
    const baseSource = await getConfig("source");
    column = `Config!B${baseSource.length + 3}`;
  } else {
    msg.reply('Invalid type, please use "Category" or "Source"');
    return;
  }

  const client = await auth.getClient();
  const request = {
    spreadsheetId: SPREADSHEET_ID,
    range: column,
    valueInputOption: "RAW",
    resource: {
      values: [data],
    },
    auth: client,
  };

  try {
    await sheets.spreadsheets.values.append(request);
    msg.reply(`Successfully added ${type}: ${data[0]}`);
    console.log("Data appended to sheet:", data);
  } catch (error) {
    msg.reply("Failed to write to sheet:", error);
    console.error("Error appending data to sheet:", error);
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

client.on("message", async (msg) => {
  const phoneNumber = "+" + msg.from.replace(/@.*$/, "");
  const regexRegister = /^([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+(.+?)$/;
  const regexOutcome =
    /^([a-zA-Z\s]+)\s+(.+?)\s+([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+(\d+)$/;
  const regexAction =
    /^([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+([a-zA-Z\s]+)\s+([a-zA-Z\s]+)$/;
  const regexSpreadsheetId = /\/d\/([a-zA-Z0-9-_]+)/;
  const baseCategory = await getConfig("category");
  const baseSource = await getConfig("source");
  const baseNumbers = await getConfig("users");
  const baseName = await getConfig("name");
  const baseSheet = await getConfig("sheet");
  let lines = "";
  let chat = await msg.getChat();
  let messages = await chat.fetchMessages({limit: chat.unreadCount, fromMe: false})
  for (const message of messages) {
    lines += message.body.split("\n");
  }

  if (baseNumbers.includes(phoneNumber)) {
    for (const line of lines) {
      if (regexOutcome.test(line)) {
        const baseAction = ["in", "out"];
        const match = line.match(regexOutcome);
        const type = match[1].trim();
        const item = match[2].trim();
        const category = match[3].trim();
        const source = match[4].trim();
        const price = parseInt(match[5], 10);
        const formattedDateTime = formatDateTime(new Date());

        const capitalizedItem = capitalizeFirstLetter(item).replace(/_/g, ' ');;
        const capitalizedCategory = capitalizeFirstLetter(category);
        const capitalizedSource = capitalizeFirstLetter(source);

        if (!baseCategory.includes(capitalizedCategory)) {
          msg.reply(
            `Invalid category "${capitalizedCategory}". Please choose from: ${baseCategory}.`
          );
        } else if (!baseSource.includes(capitalizedSource)) {
          msg.reply(
            `Invalid source "${capitalizedSource}". Please choose from: ${baseSource}.`
          );
        } else if (!baseAction.includes(type)) {
          msg.reply(
            `Invalid action "${type}". Please choose from: ${baseAction}.`
          );
        } else {
          await appendToSheet(
            [
              formattedDateTime,
              capitalizedItem,
              capitalizedCategory,
              capitalizedSource,
              price,
            ],
            msg,
            type
          );
        }
      } else if (regexAction.test(line)) {
        const match = line.match(regexAction);
        const type = match[2].trim();
        const action = match[3].trim();
        const category = match[4].trim();

        await addSomething(
          [capitalizeFirstLetter(category)],
          msg,
          capitalizeFirstLetter(type)
        );
      } else {
        msg.reply(
          `Line "${line}" is not in the correct format. Please use: "in/out item_name category price" (e.g., "out mcdonalds food bca 20000").`
        );
      }
    }
  } else if (regexRegister.test(lines[0])) {
    const match = lines[0].match(regexRegister);
    const name = match[2].trim();
    const id = match[3].trim();
    const spreadsheet = id.match(regexSpreadsheetId);
    await register([phoneNumber, name, spreadsheet[1]], msg, name);
  } else {
    msg.reply(
      `Your phone number is not registered. If you want to register please use "register [name] [your spreadsheet link]"\n\nPlease make sure to keep your name in one word and give me your full spreadsheet link after you copied this template:\n\n"https://docs.google.com/spreadsheets/d/1xPZNMn1BJiL8iXDSrT5OpSjxJQJx1vI8Nzs0HRPAH04/"`
    );
  }
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
