const nodemailer = require("nodemailer");
const { emailUser, emailPass, emailFrom, frontendUrl } = require("../config/appConfig");

/**
 * SMTP is not wired up yet. With no credentials configured the service falls
 * back to logging what it would have sent, so every calling path is exercised
 * end to end and switching it on later is purely a config change.
 */
const isConfigured = Boolean(emailUser && emailPass);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: emailUser, pass: emailPass },
  });
}

const send = async ({ to, subject, html, text }) => {
  if (!isConfigured) {
    console.log("[email:console-mode]", { to, subject });
    return { delivered: false, mode: "console" };
  }

  await transporter.sendMail({ from: emailFrom, to, subject, html, text });
  return { delivered: true, mode: "smtp" };
};

exports.send = send;

exports.sendWelcomeEmail = (user) =>
  send({
    to: user.email,
    subject: "Welcome to DocuIndia",
    text: `Hi ${user.firstName}, your DocuIndia account is ready. Open ${frontendUrl} to save your first checklist.`,
    html: `<p>Hi ${user.firstName},</p><p>Your DocuIndia account is ready.</p><p><a href="${frontendUrl}">Open DocuIndia</a></p>`,
  });

exports.sendChecklistUpdatedEmail = (user, checklist, summary) =>
  send({
    to: user.email,
    subject: `Your "${checklist.title}" checklist was updated`,
    text: `The official requirements for ${checklist.serviceLabel} changed. ${summary || ""}`,
    html: `<p>The official requirements for <strong>${checklist.serviceLabel}</strong> changed.</p><p>${summary || ""}</p><p><a href="${frontendUrl}/dashboard">Review your checklist</a></p>`,
  });

exports.isConfigured = isConfigured;
