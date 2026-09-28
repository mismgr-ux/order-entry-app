require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Safety net: if a request is not a normal form upload, treat the body as empty
// instead of crashing. (Real form uploads replace this with the parsed fields.)
app.use((req, res, next) => {
  req.body = req.body || {};
  next();
});

// One line per form. To add a new form, create routes/yourform.js and add a line here.
app.use(require('./routes/oauth'));
app.use(require('./routes/order'));
app.use(require('./routes/payment'));
app.use(require('./routes/party'));
app.use(require('./routes/job'));
app.use(require('./routes/submission'));
app.use(require('./routes/referral'));

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

module.exports = app;
