const express = require('express');
const { getOAuthClient } = require('../lib/upload');

const router = express.Router();

// One-time setup: visit /auth-drive once to authorize your Google account.
router.get('/auth-drive', (req, res) => {
  const oAuth2Client = getOAuthClient();
  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file']
  });
  res.redirect(url);
});

// Google sends you back here after you approve; shows the refresh token once.
router.get('/oauth2callback', async (req, res) => {
  try {
    const oAuth2Client = getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(req.query.code);
    res.send(`
      <h2>Authorization successful!</h2>
      <p>Copy this refresh token and save it as <b>OAUTH_REFRESH_TOKEN</b> in your environment variables:</p>
      <textarea style="width:100%;height:100px">${tokens.refresh_token}</textarea>
    `);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

module.exports = router;
