const { google } = require("googleapis");
const fs = require("fs");
const TransactionItem = require("./model/transactionItem");
const CategoryItem = require("./model/categoryItem");
const {
  formatDateTime,
  capitalizeFirstLetter,
  getGreeting,
} = require("./helper/helper");

require("dotenv").config();

const CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const ADMIN_SPREADSHEET_ID = process.env.ADMIN_SHEET_ID;

const sheets = google.sheets("v4");

const auth = new google.auth.GoogleAuth({
  credentials: CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function addTransaction(data, sheetId) {
  const inputRange =
    data.type === "out" ? "Cashflow!B:F" : "Cashflow!H:L";

  const client = await auth.getClient();

  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: inputRange,
      valueInputOption: "RAW",
      resource: {
        values: [data.toArray()],
      },
      auth: client,
    });

    return response.status === 200;
  } catch (error) {
    console.error("Error appending transaction:", error);
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

  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: column,
      valueInputOption: "RAW",
      resource: {
        values: [data.toArray()],
      },
      auth: client,
    });

    return response.status === 200;
  } catch (error) {
    console.error("Error editing config:", error);
    return false;
  }
}

async function register(data, chatId, bot, name) {
  const client = await auth.getClient();

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: ADMIN_SPREADSHEET_ID,
      range: "Accounts!A:C",
      valueInputOption: "RAW",
      resource: {
        values: [data],
      },
      auth: client,
    });

    await bot.sendMessage(
      chatId,
      `You have successfully registered! I hope you like the app ${name}\n\nTo finish the config, please add "whatsapp-admin@moneymanager-447316.iam.gserviceaccount.com" to your spreadsheet as editor.\n\nIf you have any suggestion or encountered a bug, please contact me at https://whatsapp.me/+6285229952534`
    );
  } catch (error) {
    console.error("Register error:", error);
    await bot.sendMessage(chatId, "Registration failed.");
  }
}

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
      return [];
  }

  const client = await auth.getClient();

  try {
    const response = await sheets.spreadsheets.values.get({
      auth: client,
      spreadsheetId: sheetId,
      range: baseRange,
    });

    const values = response.data.values || [];
    const set = new Set();

    values.forEach((row) => {
      if (row[0]) {
        if (type === "category" || type === "source") {
          set.add(capitalizeFirstLetter(row[0].toLowerCase()));
        } else {
          set.add(row[0]);
        }
      }
    });

    const arr = Array.from(set);
    if (arr.length > 0) arr.shift();

    return arr;
  } catch (error) {
    console.error("Error reading config:", error);

    if (
      error.response &&
      error.response.status === 403
    ) {
      throw new Error("NO_PERMISSION");
    }

    return [];
  }
}

async function checkMessage(text, msg, bot) {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  const regexRegister = /^register\s+([a-zA-Z\s]+)\s+(.+?)$/i;
  const regexOutcome =
    /^([a-zA-Z\s]+)\s+(.+?)\s+(.+?)\s+(.+?)\s+(\d+)$/;
  const regexAction =
    /^config\s+([a-zA-Z\s]+)\s+add\s+(.+?)$/i;
  const regexSpreadsheetId = /\/d\/([a-zA-Z0-9-_]+)/;
  const regexHelp = /^\.$|^hi$/i;
  const regexList = /^list\s+(category|source)$/i;
  const baseUsers = await getConfig("users", ADMIN_SPREADSHEET_ID);
  const baseName = await getConfig("name", ADMIN_SPREADSHEET_ID);
  const baseSheet = await getConfig("sheet", ADMIN_SPREADSHEET_ID);

  const userIndex = baseUsers.indexOf(userId);

  if (regexHelp.test(text)) {
    await bot.sendMessage(chatId, "Send transaction like:\nin food cash 50000");
    return;
  }

  if (userIndex === -1) {
    const match = text.match(regexRegister);
    if (match) {
      const name = match[1].trim();
      const link = match[2];
      const spreadsheet = link.match(regexSpreadsheetId);

      if (!spreadsheet) {
        await bot.sendMessage(chatId, "Invalid spreadsheet link.");
        return;
      }

      await register(
        [userId, name, spreadsheet[1]],
        chatId,
        bot,
        name
      );
    } else {
      await bot.sendMessage(
        chatId,
        'Not registered.\nUse:\nregister [your_name] [spreadsheet_link]'
      );
    }
    return;
  }

  const sheetId = baseSheet[userIndex];
  let baseCategory = [];
  let baseSource = [];

  try {
    baseCategory = await getConfig("category", sheetId);
    baseSource = await getConfig("source", sheetId);
  } catch (err) {
    if (err.message === "NO_PERMISSION") {
      await bot.sendMessage(
        chatId,
        `Please add "whatsapp-admin@moneymanager-447316.iam.gserviceaccount.com" as editor to your spreadsheet first.`
      );
      return;
    }

    await bot.sendMessage(chatId, "Unexpected error reading spreadsheet.");
    return;
  }

  // ===== SUMMARY COMMAND =====
  if (text.toLowerCase().startsWith("summary")) {
    const args = text.replace(/summary/i, "").trim();

    try {
      const result = await handleSummary(args, sheetId);
      await bot.sendMessage(chatId, result);
    } catch (err) {
      await bot.sendMessage(chatId, err.message);
    }

    return;
  }

  const matchOutcome = text.match(regexOutcome);
  if (matchOutcome) {
    const type = matchOutcome[1].trim();
    const item = capitalizeFirstLetter(matchOutcome[2]);
    const category = capitalizeFirstLetter(matchOutcome[3]);
    const source = capitalizeFirstLetter(matchOutcome[4]);
    const amount = parseInt(matchOutcome[5], 10);

    if (!baseCategory.includes(category)) {
      await bot.sendMessage(chatId, "Invalid category.");
      return;
    }

    if (!baseSource.includes(source)) {
      await bot.sendMessage(chatId, "Invalid source.");
      return;
    }

    const trx = new TransactionItem(
      formatDateTime(msg.date),
      item,
      category,
      source,
      amount,
      type
    );

    const success = await addTransaction(trx, sheetId);

    await bot.sendMessage(
      chatId,
      success ? "Transaction added." : "Failed to add transaction."
    );

    return;
  }

  const matchList = text.match(regexList);
  if (matchList) {
    const type = matchList[1].toLowerCase();

    let list = [];

    if (type === "category") {
      list = await getConfig("category", sheetId);
    } else {
      list = await getConfig("source", sheetId);
    }

    if (list.length === 0) {
      await bot.sendMessage(chatId, `No ${type} found.`);
      return;
    }

    const formatted = list.map((item, index) => `${index + 1}. ${item}`).join("\n");

    await bot.sendMessage(
      chatId,
      `Your ${type} list:\n\n${formatted}`
    );

    return;
  }

  const matchConfig = text.match(regexAction);
  if (matchConfig) {
    const type = capitalizeFirstLetter(matchConfig[1]);
    const name = capitalizeFirstLetter(matchConfig[2]);

    const item = new CategoryItem(name, type);
    const success = await editConfig(item, sheetId);

    await bot.sendMessage(
      chatId,
      success ? "Config added." : "Failed to add config."
    );

    return;
  }

  await bot.sendMessage(chatId, "Invalid format.");
}

async function getAllTransactions(sheetId) {
  const client = await auth.getClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Cashflow!B2:L",
    auth: client,
  });

  const rows = response.data.values || [];

  const transactions = [];

  rows.forEach((row) => {
    if (!row[0]) return;

    const date = new Date(row[0]);
    const amount = Number(row[4] || row[9]);
    const type = row[4] ? "out" : "in";

    transactions.push({ date, amount, type });
  });

  return transactions;
}

async function handleSummary(args, sheetId) {
  const today = new Date();

  if (!args) {
    return await summaryByDate(today, sheetId);
  }

  // RANGE
  if (args.includes("-")) {
    const parts = args.split("-").map((p) => p.trim());

    if (parts.length !== 2)
      throw new Error("Invalid range format. Use dd/mm/yyyy - dd/mm/yyyy");

    const start = parseDate(parts[0]);
    const end = parseDate(parts[1]);

    if (!start || !end)
      throw new Error("Invalid date format. Use dd/mm/yyyy");

    if (end < start)
      throw new Error("End date cannot be earlier than start date.");

    return await summaryByRange(start, end, sheetId);
  }

  // YEAR
  if (/^\d{4}$/.test(args)) {
    return await summaryByYear(parseInt(args), sheetId);
  }

  // MONTH
  const monthMatch = args.match(/^([a-zA-Z]+)(\s+\d{4})?$/);

  if (monthMatch) {
    const monthIndex = getMonthIndex(monthMatch[1]);
    const year = monthMatch[2]
      ? parseInt(monthMatch[2])
      : today.getFullYear();

    if (monthIndex === -1)
      throw new Error("Invalid month name.");

    return await summaryByMonth(monthIndex, year, sheetId);
  }

  // SINGLE DATE
  const single = parseDate(args);
  if (single)
    return await summaryByDate(single, sheetId);

  throw new Error("Invalid summary format.");
}

function parseDate(str) {
  const parts = str.split("/");
  if (parts.length !== 3) return null;

  const [dd, mm, yyyy] = parts.map(Number);
  const date = new Date(yyyy, mm - 1, dd);

  if (
    date.getFullYear() !== yyyy ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  )
    return null;

  return date;
}

function getMonthIndex(name) {
  const months = [
    "january","february","march","april","may","june",
    "july","august","september","october","november","december"
  ];

  return months.indexOf(name.toLowerCase());
}

async function summaryByDate(date, sheetId) {
  const data = await getAllTransactions(sheetId);

  const filtered = data.filter(
    (t) => t.date.toDateString() === date.toDateString()
  );

  return buildSummary(filtered, date.toDateString());
}

async function summaryByRange(start, end, sheetId) {
  const data = await getAllTransactions(sheetId);

  const filtered = data.filter(
    (t) => t.date >= start && t.date <= end
  );

  return buildSummary(filtered, `${start.toDateString()} - ${end.toDateString()}`);
}

async function summaryByMonth(month, year, sheetId) {
  const data = await getAllTransactions(sheetId);

  const filtered = data.filter(
    (t) =>
      t.date.getMonth() === month &&
      t.date.getFullYear() === year
  );

  return buildSummary(filtered, `Month ${month + 1}/${year}`);
}

async function summaryByYear(year, sheetId) {
  const data = await getAllTransactions(sheetId);

  const filtered = data.filter(
    (t) => t.date.getFullYear() === year
  );

  return buildSummary(filtered, `Year ${year}`);
}

function buildSummary(transactions, label) {
  let totalIn = 0;
  let totalOut = 0;

  transactions.forEach((t) => {
    if (t.type === "in") totalIn += t.amount;
    else totalOut += t.amount;
  });

  const balance = totalIn - totalOut;

  return `
  Summary for ${label}

  Income  : ${totalIn}
  Expense : ${totalOut}
  Balance : ${balance}
  Total Transactions : ${transactions.length}
  `;
}

module.exports = { checkMessage };