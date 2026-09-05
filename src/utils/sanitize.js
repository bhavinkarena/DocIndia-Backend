/**
 * Two different jobs, deliberately kept apart:
 *
 *   stripTags  — runs on the way IN. User-submitted free text has no business
 *                carrying markup, so it never reaches the database at all.
 *                Storing raw and escaping on output means every future
 *                consumer has to remember to escape; one that forgets is a
 *                stored XSS. Cleaning at the boundary is the version that
 *                stays safe when someone adds a new template next year.
 *
 *   escapeHtml — runs on the way OUT, in HTML email templates. Those build
 *                markup by string interpolation, where React's automatic
 *                escaping does not apply. Belt and braces: stripTags already
 *                cleaned what we stored, but email also interpolates values
 *                that never passed through a validation schema (service
 *                labels from the CMS, generated titles).
 */

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes the five characters that can break out of HTML text or an attribute. */
const escapeHtml = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
};

/**
 * Removes markup from user input.
 *
 * Order matters. Script and style bodies go first, whole — dropping only the
 * tags would leave the JavaScript behind as visible text, which is worse than
 * either escaping or removing it. Then remaining tags, then HTML comments
 * (which can hide conditional-comment payloads), then the entity forms an
 * attacker uses to smuggle a bracket past a naive tag stripper.
 */
const stripTags = (value) => {
  if (value === null || value === undefined) return value;

  let output = String(value);

  output = output.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  output = output.replace(/<!--[\s\S]*?-->/g, "");
  output = output.replace(/<\/?[a-z][\s\S]*?>/gi, "");

  // "&lt;script&gt;" survives tag stripping and becomes live markup again the
  // moment anything decodes entities. Neutralise the brackets themselves.
  output = output.replace(/&(lt|gt|#0*(60|62)|#x0*(3c|3e));/gi, "");

  return output.trim();
};

/**
 * Joi custom sanitiser. Attach with `.custom(sanitizeText)` on any free-text
 * field a human types.
 *
 * Joi runs `.custom()` after the built-in rules, so `.max(2000)` measures the
 * text the user submitted rather than the shorter cleaned version — someone
 * cannot slip a 3000-character comment past the limit by padding it with
 * markup that gets stripped afterwards.
 */
const sanitizeText = (value) => (typeof value === "string" ? stripTags(value) : value);

/** Recursively strips tags from every string in an object or array. */
const sanitizeDeep = (input) => {
  if (typeof input === "string") return stripTags(input);
  if (Array.isArray(input)) return input.map(sanitizeDeep);
  if (input && typeof input === "object" && input.constructor === Object) {
    return Object.fromEntries(
      Object.entries(input).map(([key, val]) => [key, sanitizeDeep(val)])
    );
  }
  return input;
};

module.exports = { escapeHtml, stripTags, sanitizeText, sanitizeDeep };
