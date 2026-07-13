// server.js
// Local development entry point. Deploy targets (Vercel/Netlify) use
// api/index.js directly as a serverless function instead - see README.

require("dotenv").config();
const path = require("path");
const express = require("express");
const apiApp = require("./api/index");

const app = express();
app.use(apiApp); // mounts all /api/* routes
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ticketing system running at http://localhost:${PORT}`);
});

const sendEmail = require("./services/emailService");

//const sendEmail = require("./services/emailService");


//sendEmail(
//"agbenyegahcollins3@gmail.com",
//"Test Email",
//"This is a test from my ticket system"
//);