const nodemailer = require("nodemailer");
const { emailUser, emailPass, emailFrom, frontendUrl } = require("../config/appConfig");
const { escapeHtml } = require("../utils/sanitize");
const logger = require("../utils/logger");

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
    logger.info({ to, subject }, "Email not sent — running in console mode");
    return { delivered: false, mode: "console" };
  }

  await transporter.sendMail({ from: emailFrom, to, subject, html, text });
  return { delivered: true, mode: "smtp" };
};

/**
 * Every value interpolated into an HTML body goes through this first.
 *
 * These templates build markup by string concatenation, which is the one place
 * in the stack with no automatic escaping — React handles the browser, but a
 * mail client renders whatever we hand it. Validation already strips tags from
 * what users submit, so this is the second layer, and it is the only layer for
 * values that never passed a validation schema: CMS-authored service labels,
 * checklist titles generated server-side, summaries written by an editor.
 *
 * Plain-text bodies are left alone — there is no markup to break out of.
 */
const e = escapeHtml;

exports.send = send;

exports.sendWelcomeEmail = (user) =>
  send({
    to: user.email,
    subject: "Welcome to DocuIndia",
    text: `Hi ${user.firstName}, your DocuIndia account is ready. Open ${frontendUrl} to save your first checklist.`,
    html: `<p>Hi ${e(user.firstName)},</p><p>Your DocuIndia account is ready.</p><p><a href="${e(frontendUrl)}">Open DocuIndia</a></p>`,
  });

/**
 * Takes a LIST of checklists, not one.
 *
 * A single rule edit can affect several of a user's saved checklists at once —
 * the same service saved for two family members, say. One email per checklist
 * would arrive as a burst that reads like a malfunction, so they are batched
 * into one message per person. See notifyAffectedUsers in rule.service.js.
 */
exports.sendChecklistUpdatedEmail = (user, checklists, summary) => {
  const list = Array.isArray(checklists) ? checklists : [checklists];
  const name = (c) => c.title || c.serviceLabel || "your checklist";
  const many = list.length > 1;

  const subject = many
    ? `${list.length} of your DocuIndia checklists were updated`
    : `Your "${name(list[0])}" checklist was updated`;

  const lead = many
    ? "The official requirements changed for these saved checklists:"
    : `The official requirements for ${list[0].serviceLabel} changed.`;

  return send({
    to: user.email,
    subject,
    text:
      `${lead}\n` +
      (many ? list.map((c) => `  - ${name(c)}`).join("\n") + "\n" : "") +
      (summary ? `\n${summary}\n` : "") +
      `\nYour saved copy is unchanged — review what moved at ${frontendUrl}/dashboard`,
    html:
      `<p>${
        many
          ? "The official requirements changed for these saved checklists:"
          : `The official requirements for <strong>${e(list[0].serviceLabel)}</strong> changed.`
      }</p>` +
      (many
        ? `<ul>${list.map((c) => `<li>${e(name(c))}</li>`).join("")}</ul>`
        : "") +
      (summary ? `<p>${e(summary)}</p>` : "") +
      // Says plainly that nothing was rewritten. The whole trust story rests on
      // a saved checklist being exactly what the tool said on the day it was
      // saved — an email implying otherwise would undercut that.
      `<p>Your saved copy has not been changed. We have flagged it so you can see what moved.</p>` +
      `<p><a href="${e(frontendUrl)}/dashboard">Review ${many ? "your checklists" : "your checklist"}</a></p>`,
  });
};

/**
 * The reset link carries the raw token; only its hash is stored. See
 * user.service.forgotPassword for why.
 *
 * The token is URL-encoded rather than escaped — it is hex, so encoding is a
 * no-op today, but it stops a future change to the token format from silently
 * producing a broken or injectable link.
 */
exports.sendPasswordResetEmail = (user, token, expiryMinutes) => {
  const link = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;

  return send({
    to: user.email,
    subject: "Reset your DocuIndia password",
    text:
      `Hi ${user.firstName}, someone asked to reset your DocuIndia password.\n\n` +
      `Open this link within ${expiryMinutes} minutes to choose a new one:\n${link}\n\n` +
      `If this wasn't you, ignore this email — your password stays as it is.`,
    html:
      `<p>Hi ${e(user.firstName)},</p>` +
      `<p>Someone asked to reset your DocuIndia password.</p>` +
      `<p><a href="${e(link)}">Choose a new password</a></p>` +
      `<p>This link expires in ${e(expiryMinutes)} minutes and can be used once.</p>` +
      `<p>If this wasn't you, ignore this email — your password stays as it is.</p>`,
  });
};

/**
 * Warns a student before a watched scholarship closes.
 *
 * Sent as one mail per tier per scholarship rather than a digest, because the
 * action is per-scholarship and a digest buries the one that closes on Friday
 * among four that close next month. The lead time is stated in the subject:
 * "closes in 7 days" is what makes someone open it today rather than tonight.
 */
exports.sendScholarshipReminderEmail = (user, scholarship, daysLeft) => {
  const url = `${frontendUrl}/scholarships/${scholarship.slug}`;
  const closing =
    daysLeft === 0
      ? "closes today"
      : daysLeft === 1
      ? "closes tomorrow"
      : `closes in ${daysLeft} days`;

  const lines = [
    `Hi ${user.firstName},`,
    "",
    `${scholarship.name} ${closing}.`,
    scholarship.applyUrl ? `Apply here: ${scholarship.applyUrl}` : "",
    `See what you need: ${url}`,
    "",
    "DocuIndia never charges a fee for any scholarship. If anyone asks you",
    "for money to apply, it is a scam.",
  ].filter(Boolean);

  return send({
    to: user.email,
    subject: `${scholarship.name} ${closing}`,
    text: lines.join("\n"),
    html:
      `<p>Hi ${e(user.firstName)},</p>` +
      `<p><strong>${e(scholarship.name)}</strong> ${e(closing)}.</p>` +
      (scholarship.applyUrl
        ? `<p><a href="${e(scholarship.applyUrl)}">Apply on ${e(
            scholarship.provider?.portalName || "the official portal"
          )}</a></p>`
        : "") +
      `<p><a href="${e(url)}">See what documents you need</a></p>` +
      `<hr><p style="font-size:12px;color:#666">DocuIndia never charges a fee ` +
      `for any scholarship. If anyone asks you for money to apply, it is a scam.</p>`,
  });
};

exports.isConfigured = isConfigured;
