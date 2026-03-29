const { verifyEmailTransport, getEmailStatus } = require("../../lib/email");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  // Refresh status on each health check
  try {
    await verifyEmailTransport();
  } catch (e) {
    // ignore
  }

  return res.json({ ok: true, ...getEmailStatus() });
};

