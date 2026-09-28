const { google } = require('googleapis');

// Formats a date as DD-Mon-YY:HH:MM:SS in Indian time, for the Timestamp column.
function formatTimestamp(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const istOffsetMs = 5.5 * 60 * 60000;
  const ist = new Date(date.getTime() + istOffsetMs);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = months[ist.getUTCMonth()];
  const year = String(ist.getUTCFullYear()).slice(-2);
  const hours = String(ist.getUTCHours()).padStart(2, '0');
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
  const seconds = String(ist.getUTCSeconds()).padStart(2, '0');
  return `${day}-${month}-${year}:${hours}:${minutes}:${seconds}`;
}

async function getSheetsClient() {
  const authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } else {
    authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const auth = new google.auth.GoogleAuth(authOptions);
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// Sheet (tab) name se pata lagata hai ki kaunsi spreadsheet use karni hai.
function resolveSpreadsheetId(sheetName) {
  const hrTabs = [
    process.env.HR_JOB_SHEET,
    process.env.HR_REFERRAL_SHEET,
    process.env.HR_SUBMISSION_SHEET
  ].filter(Boolean);

  if (hrTabs.includes(sheetName)) return process.env.HR_SPREADSHEET_ID;
  return process.env.SPREADSHEET_ID;
}

// Dono tareeke chalte hain:
//   appendToSheet(sheetName, row)
//   appendToSheet(spreadsheetId, sheetName, row)
async function appendToSheet(...args) {
  let spreadsheetId, sheetName, row;

  if (args.length >= 3) {
    [spreadsheetId, sheetName, row] = args;
  } else {
    [sheetName, row] = args;
  }

  if (!sheetName) {
    throw new Error('sheetName missing. Check the .env variable name used in the route.');
  }

  // Agar ID nahi mili to tab ke naam se automatically choose karo
  if (!spreadsheetId) {
    spreadsheetId = resolveSpreadsheetId(sheetName);
  }

  if (!spreadsheetId) {
    throw new Error(
      `spreadsheetId missing for sheet "${sheetName}". ` +
      'Check SPREADSHEET_ID / HR_SPREADSHEET_ID in .env (or Vercel env variables).'
    );
  }

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName}'!A1`,   // quotes zaroori hain: "Job Apply" me space hai
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

module.exports = { formatTimestamp, appendToSheet };