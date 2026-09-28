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

// Appends one row to a given spreadsheet and tab name.
async function appendToSheet(spreadsheetId, sheetName, row) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

module.exports = { formatTimestamp, appendToSheet };
