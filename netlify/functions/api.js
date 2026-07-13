// netlify/functions/api.js
// Wraps the same Express app used for Vercel/local dev so it can run
// as a single Netlify Function. Requires the "serverless-http" package
// (listed in package.json).

const serverless = require("serverless-http");
const app = require("../../api/index");

exports.handler = serverless(app);
