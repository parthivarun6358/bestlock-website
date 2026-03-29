require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// Serve the static website files from this folder (index.html, contact.html, /images, etc.)
app.use(express.static(__dirname));

const PORT = process.env.PORT || process.env.port || 3000;

// MySQL connection
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "bestlock",
});

// Email setup (Gmail by default)
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER;
const EMAIL_NOTIFY_TO = process.env.EMAIL_NOTIFY_TO || process.env.EMAIL_TO || null;
const emailStatus = {
  ready: false,
  lastError: null,
  lastCheckedAt: null,
};

function isPlaceholderPassword(pass) {
  if (!pass) return true;
  const normalized = String(pass).trim().toLowerCase();
  return (
    normalized === "paste_your_gmail_app_password_here" ||
    normalized.includes("paste_your_gmail_app_password_here") ||
    normalized.includes("app_password_here")
  );
}

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS && EMAIL_FROM && !isPlaceholderPassword(process.env.EMAIL_PASS));
}

const transporter = process.env.EMAIL_HOST
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: String(process.env.EMAIL_SECURE).toLowerCase() === "true", // true for 465, false for 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })
  : nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

async function verifyEmailTransport() {
  emailStatus.lastCheckedAt = new Date().toISOString();

  if (!isEmailConfigured()) {
    if (emailStatus.lastError !== "Email not configured") {
      console.warn("Email not configured: set EMAIL_USER, EMAIL_PASS, and EMAIL_FROM in .env");
    }
    emailStatus.ready = false;
    emailStatus.lastError = "Email not configured";
    return false;
  }

  try {
    await transporter.verify();
    emailStatus.ready = true;
    emailStatus.lastError = null;
    console.log("Email transporter ready");
    return true;
  } catch (err) {
    emailStatus.ready = false;
    emailStatus.lastError = err?.message || String(err);
    console.warn("Email transporter not ready:", emailStatus.lastError);
    return false;
  }
}

// Kick off a startup check (but don't block server boot)
verifyEmailTransport();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, message: "All fields required" });
    }

    // Save to MySQL
    try {
      await pool.execute("INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)", [
        name,
        email,
        message,
      ]);
    } catch (dbErr) {
      console.error("DB error:", dbErr);
      return res.status(500).json({ ok: false, message: "Database error" });
    }

    // Send email reply + admin notification (best-effort; do not fail the contact form if email is down)
    const transportOk = await verifyEmailTransport();
    let emailSentUser = false;
    let emailSentAdmin = false;
    try {
      if (transportOk) {
        const jobs = [];

        // Notify site owner/team
        if (EMAIL_NOTIFY_TO) {
          jobs.push(
            transporter.sendMail({
              from: EMAIL_FROM,
              to: EMAIL_NOTIFY_TO,
              subject: `New contact form message from ${name}`,
              replyTo: email,
              text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n`,
            })
          );
        }

        // Auto-reply to the customer
        jobs.push(
          transporter.sendMail({
            from: EMAIL_FROM,
            to: email,
            subject: "Thank you for contacting BestLock",
            replyTo: EMAIL_NOTIFY_TO || EMAIL_FROM,
            text: `Hi ${name},\n\nThanks for contacting BestLock. We received your message:\n\n${message}\n\nWe will contact you soon.\n\n- BestLock Team`,
          })
        );

        const results = await Promise.allSettled(jobs);
        // If EMAIL_NOTIFY_TO is not set, only the auto-reply job runs.
        if (EMAIL_NOTIFY_TO) {
          emailSentAdmin = results[0]?.status === "fulfilled";
          emailSentUser = results[1]?.status === "fulfilled";
        } else {
          emailSentAdmin = false;
          emailSentUser = results[0]?.status === "fulfilled";
        }

        const firstRejected = results.find((r) => r.status === "rejected");
        if (firstRejected) {
          emailStatus.lastError =
            firstRejected.reason?.message || String(firstRejected.reason || "Email send failed");
        }
      }
    } catch (mailErr) {
      console.error("Email error:", mailErr);
      emailStatus.ready = false;
      emailStatus.lastError = mailErr?.message || String(mailErr);
    }

    if (!transportOk || !emailStatus.ready) {
      const errorMsg = emailStatus.lastError || "Email not ready";
      const message =
        errorMsg === "Email not configured"
          ? "Message received. Email auto-reply is not configured (set EMAIL_USER, EMAIL_PASS, EMAIL_FROM)."
          : "Message received. Email reply could not be sent right now (check server logs / EMAIL_* settings).";

      return res.json({
        ok: true,
        emailSentUser: false,
        emailSentAdmin: false,
        message,
        ...(process.env.NODE_ENV !== "production" ? { emailError: errorMsg } : {}),
      });
    }

    const parts = [];
    parts.push("Message received");
    if (emailSentUser) parts.push("auto-reply sent");
    else parts.push("auto-reply not sent");
    if (EMAIL_NOTIFY_TO) {
      if (emailSentAdmin) parts.push("notification sent");
      else parts.push("notification not sent");
    }

    return res.json({
      ok: true,
      emailSentUser,
      emailSentAdmin,
      message: parts.join(". ") + ".",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

app.get("/health/email", (req, res) => {
  res.json({
    ok: true,
    configured: isEmailConfigured(),
    ...emailStatus,
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
