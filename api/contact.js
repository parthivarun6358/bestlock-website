const { saveContact } = require("../lib/db");
const { sendContactEmails, getEmailStatus } = require("../lib/email");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : await readJsonBody(req);
    const { name, email, message } = body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, message: "All fields required" });
    }

    // DB save (best-effort on Vercel; don't block email)
    let dbSaved = false;
    let dbSkipped = false;
    try {
      const dbRes = await saveContact({ name, email, message });
      dbSaved = Boolean(dbRes?.ok);
      dbSkipped = Boolean(dbRes?.skipped);
    } catch (dbErr) {
      // keep going
      console.error("DB error:", dbErr);
    }

    // Email (best-effort)
    let emailSentUser = false;
    let emailSentAdmin = false;
    try {
      const mailRes = await sendContactEmails({ name, email, message });
      emailSentUser = Boolean(mailRes?.emailSentUser);
      emailSentAdmin = Boolean(mailRes?.emailSentAdmin);
    } catch (mailErr) {
      console.error("Email error:", mailErr);
    }

    const parts = [];
    parts.push("Message received");
    parts.push(emailSentUser ? "auto-reply sent" : "auto-reply not sent");
    if (getEmailStatus().notifyTo) {
      parts.push(emailSentAdmin ? "notification sent" : "notification not sent");
    }
    if (dbSaved) parts.push("saved to database");
    else if (dbSkipped) parts.push("database skipped");

    const status = getEmailStatus();
    const extra =
      process.env.NODE_ENV !== "production" && !status.ready
        ? { emailError: status.lastError || "Email not ready" }
        : {};

    return res.json({
      ok: true,
      emailSentUser,
      emailSentAdmin,
      dbSaved,
      message: parts.join(". ") + ".",
      ...extra,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: err?.message || "Server error" });
  }
};

