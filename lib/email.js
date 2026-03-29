const nodemailer = require("nodemailer");

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
  return Boolean(
    process.env.EMAIL_USER &&
      process.env.EMAIL_PASS &&
      EMAIL_FROM &&
      !isPlaceholderPassword(process.env.EMAIL_PASS)
  );
}

function createTransporter() {
  return process.env.EMAIL_HOST
    ? nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT || 587),
        secure: String(process.env.EMAIL_SECURE).toLowerCase() === "true",
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
}

const transporter = createTransporter();

async function verifyEmailTransport() {
  emailStatus.lastCheckedAt = new Date().toISOString();

  if (!isEmailConfigured()) {
    emailStatus.ready = false;
    emailStatus.lastError = "Email not configured";
    return false;
  }

  try {
    await transporter.verify();
    emailStatus.ready = true;
    emailStatus.lastError = null;
    return true;
  } catch (err) {
    emailStatus.ready = false;
    emailStatus.lastError = err?.message || String(err);
    return false;
  }
}

async function sendContactEmails({ name, email, message }) {
  const transportOk = await verifyEmailTransport();
  let emailSentUser = false;
  let emailSentAdmin = false;

  if (!transportOk) {
    return { transportOk, emailSentUser, emailSentAdmin };
  }

  const jobs = [];

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

  if (EMAIL_NOTIFY_TO) {
    emailSentAdmin = results[0]?.status === "fulfilled";
    emailSentUser = results[1]?.status === "fulfilled";
  } else {
    emailSentUser = results[0]?.status === "fulfilled";
  }

  const firstRejected = results.find((r) => r.status === "rejected");
  if (firstRejected) {
    emailStatus.lastError =
      firstRejected.reason?.message || String(firstRejected.reason || "Email send failed");
  }

  return { transportOk, emailSentUser, emailSentAdmin };
}

function getEmailStatus() {
  return {
    configured: isEmailConfigured(),
    from: EMAIL_FROM || null,
    notifyTo: EMAIL_NOTIFY_TO,
    ...emailStatus,
  };
}

module.exports = {
  verifyEmailTransport,
  sendContactEmails,
  getEmailStatus,
};

