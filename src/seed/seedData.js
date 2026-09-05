/**
 * Starter content.
 *
 * IMPORTANT: every rule seeded here is written with verificationStatus
 * "unverified" and lastVerifiedAt null, and none of the categories are
 * published. This data exists to exercise the schema and give the admin CMS
 * something to edit — it is NOT a verified statement of what any government
 * body currently requires. Someone has to sit down with the official sources
 * and confirm each line before any of it is published.
 */

const documents = [
  {
    name: "PAN Card",
    slug: "pan-card",
    description:
      "Permanent Account Number issued by the Income Tax Department. Required as identity/tax proof across most registrations.",
    issuingBody: "Income Tax Department",
    officialUrl: "https://www.incometax.gov.in/iec/foportal/",
    hasExpiry: false,
  },
  {
    name: "Aadhaar Card",
    slug: "aadhaar-card",
    description: "12-digit unique identity number issued by UIDAI.",
    issuingBody: "Unique Identification Authority of India (UIDAI)",
    officialUrl: "https://uidai.gov.in/",
    hasExpiry: false,
  },
  {
    name: "Passport-size Photograph",
    slug: "passport-size-photograph",
    description: "Recent colour photograph against a plain background.",
    issuingBody: "",
    officialUrl: "",
    hasExpiry: false,
  },
  {
    name: "Electricity Bill",
    slug: "electricity-bill",
    description:
      "Recent utility bill used as proof of the registered office address.",
    issuingBody: "State electricity board / DISCOM",
    officialUrl: "",
    hasExpiry: false,
  },
  {
    name: "Rent Agreement",
    slug: "rent-agreement",
    description:
      "Executed rental or lease agreement for premises the applicant does not own.",
    issuingBody: "",
    officialUrl: "",
    hasExpiry: true,
    typicalValidity: "As per agreement term",
  },
  {
    name: "No Objection Certificate from Property Owner",
    slug: "noc-property-owner",
    description:
      "Written consent from the owner to use the premises as a registered office.",
    issuingBody: "",
    officialUrl: "",
    hasExpiry: false,
  },
  {
    name: "Digital Signature Certificate (DSC)",
    slug: "digital-signature-certificate",
    description:
      "Class 3 DSC required to sign incorporation and compliance filings electronically.",
    issuingBody: "Licensed Certifying Authority (CCA-approved)",
    officialUrl: "https://www.cca.gov.in/licensed_ca.html",
    hasExpiry: true,
    typicalValidity: "1–3 years",
  },
  {
    name: "Director Identification Number (DIN)",
    slug: "director-identification-number",
    description: "Unique number required for anyone appointed as a director.",
    issuingBody: "Ministry of Corporate Affairs",
    officialUrl: "https://www.mca.gov.in/",
    hasExpiry: false,
  },
  {
    name: "Memorandum of Association (MOA)",
    slug: "memorandum-of-association",
    description:
      "Charter document setting out the company's objects and scope of activity.",
    issuingBody: "Ministry of Corporate Affairs",
    officialUrl: "https://www.mca.gov.in/",
    hasExpiry: false,
  },
  {
    name: "Articles of Association (AOA)",
    slug: "articles-of-association",
    description: "Document setting out the company's internal governance rules.",
    issuingBody: "Ministry of Corporate Affairs",
    officialUrl: "https://www.mca.gov.in/",
    hasExpiry: false,
  },
  {
    name: "LLP Agreement",
    slug: "llp-agreement",
    description:
      "Agreement between partners governing a Limited Liability Partnership.",
    issuingBody: "Ministry of Corporate Affairs",
    officialUrl: "https://www.mca.gov.in/",
    hasExpiry: false,
  },
  {
    name: "Partnership Deed",
    slug: "partnership-deed",
    description: "Deed constituting a traditional partnership firm.",
    issuingBody: "Registrar of Firms (state)",
    officialUrl: "",
    hasExpiry: false,
  },
  {
    name: "Cancelled Cheque",
    slug: "cancelled-cheque",
    description: "Cancelled cheque used to evidence bank account details.",
    issuingBody: "Applicant's bank",
    officialUrl: "",
    hasExpiry: false,
  },
  {
    name: "Bank Account Statement",
    slug: "bank-account-statement",
    description: "Recent statement for the business or proprietor account.",
    issuingBody: "Applicant's bank",
    officialUrl: "",
    hasExpiry: false,
  },
  {
    name: "Board Resolution",
    slug: "board-resolution",
    description:
      "Resolution authorising a named signatory to act on the entity's behalf.",
    issuingBody: "Applicant company",
    officialUrl: "",
    hasExpiry: false,
  },
  {
    name: "Indian Passport",
    slug: "indian-passport",
    description: "Passport issued by the Ministry of External Affairs.",
    issuingBody: "Ministry of External Affairs",
    officialUrl: "https://www.passportindia.gov.in/",
    hasExpiry: true,
    typicalValidity: "10 years (adult)",
  },
  {
    name: "Voter ID (EPIC)",
    slug: "voter-id",
    description: "Elector's Photo Identity Card issued by the Election Commission.",
    issuingBody: "Election Commission of India",
    officialUrl: "https://voters.eci.gov.in/",
    hasExpiry: false,
  },
  {
    name: "Driving Licence",
    slug: "driving-licence",
    description: "Licence issued by the state transport authority.",
    issuingBody: "State Transport Department / RTO",
    officialUrl: "https://parivahan.gov.in/",
    hasExpiry: true,
    typicalValidity: "20 years or until age 50, whichever is earlier",
  },
];

const categories = [
  {
    label: "Register a Business",
    slug: "register-a-business",
    description:
      "Documents typically required to incorporate or register a business entity in India.",
    examplePrompt: "I want to register a private limited company in Gujarat",
    keywords: [
      "register a business",
      "business registration",
      "company registration",
      "incorporate",
      "incorporation",
      "start a company",
      "private limited",
      "pvt ltd",
      "llp",
      "partnership firm",
      "sole proprietorship",
      "opc",
      "startup registration",
    ],
    icon: "building",
    order: 1,
    questions: [
      {
        key: "state",
        label: "Which state or union territory will the business be registered in?",
        type: "state-select",
        helpText: "Registration formalities and the relevant registrar vary by state.",
        required: true,
        order: 1,
      },
      {
        key: "entityType",
        label: "What kind of entity are you registering?",
        type: "single-select",
        required: true,
        order: 2,
        options: [
          { value: "private-limited", label: "Private Limited Company" },
          { value: "llp", label: "Limited Liability Partnership (LLP)" },
          { value: "opc", label: "One Person Company (OPC)" },
          { value: "partnership", label: "Partnership Firm" },
          { value: "proprietorship", label: "Sole Proprietorship" },
        ],
      },
      {
        key: "premisesOwned",
        label: "Do you own the premises you'll register as the office address?",
        type: "boolean",
        helpText: "Rented premises usually need a rent agreement and owner's NOC.",
        required: true,
        order: 3,
      },
    ],
  },
  {
    label: "GST Registration",
    slug: "gst-registration",
    description:
      "Documents typically required to obtain a Goods and Services Tax registration.",
    examplePrompt: "I need to register for GST for my proprietorship in Maharashtra",
    keywords: [
      "gst",
      "gst registration",
      "goods and services tax",
      "gstin",
      "tax registration",
      "register for gst",
    ],
    icon: "receipt",
    order: 2,
    questions: [
      {
        key: "state",
        label: "In which state or union territory are you registering?",
        type: "state-select",
        helpText: "GST registration is state-specific.",
        required: true,
        order: 1,
      },
      {
        key: "constitution",
        label: "What is the constitution of your business?",
        type: "single-select",
        required: true,
        order: 2,
        options: [
          { value: "proprietorship", label: "Sole Proprietorship" },
          { value: "partnership", label: "Partnership Firm" },
          { value: "llp", label: "LLP" },
          { value: "company", label: "Private / Public Limited Company" },
        ],
      },
      {
        key: "premisesOwned",
        label: "Do you own the principal place of business?",
        type: "boolean",
        required: true,
        order: 3,
      },
    ],
  },
];

/**
 * Rules are expressed as document *slugs* here; the seeder resolves them to
 * ObjectIds. That keeps this file readable and makes a typo fail loudly at
 * seed time instead of producing a dangling reference.
 */
const rules = {
  "register-a-business": {
    baseDocuments: [
      { slug: "pan-card", mandatory: true, note: "For all directors/partners/proprietor." },
      { slug: "aadhaar-card", mandatory: true, note: "For all directors/partners/proprietor." },
      { slug: "passport-size-photograph", mandatory: true },
      { slug: "electricity-bill", mandatory: true, note: "As proof of the registered office address." },
    ],
    conditionalBlocks: [
      {
        label: "Rented premises",
        matchType: "all",
        conditions: [{ questionKey: "premisesOwned", operator: "eq", value: false }],
        documents: [
          { slug: "rent-agreement", mandatory: true },
          { slug: "noc-property-owner", mandatory: true },
        ],
      },
      {
        label: "Companies and LLPs (MCA filings)",
        matchType: "any",
        conditions: [
          { questionKey: "entityType", operator: "eq", value: "private-limited" },
          { questionKey: "entityType", operator: "eq", value: "opc" },
          { questionKey: "entityType", operator: "eq", value: "llp" },
        ],
        documents: [
          { slug: "digital-signature-certificate", mandatory: true },
          { slug: "director-identification-number", mandatory: true },
        ],
      },
      {
        label: "Company incorporation documents",
        matchType: "any",
        conditions: [
          { questionKey: "entityType", operator: "eq", value: "private-limited" },
          { questionKey: "entityType", operator: "eq", value: "opc" },
        ],
        documents: [
          { slug: "memorandum-of-association", mandatory: true },
          { slug: "articles-of-association", mandatory: true },
        ],
      },
      {
        label: "LLP agreement",
        matchType: "all",
        conditions: [{ questionKey: "entityType", operator: "eq", value: "llp" }],
        documents: [{ slug: "llp-agreement", mandatory: true }],
      },
      {
        label: "Partnership deed",
        matchType: "all",
        conditions: [{ questionKey: "entityType", operator: "eq", value: "partnership" }],
        documents: [{ slug: "partnership-deed", mandatory: true }],
      },
      {
        label: "Proprietorship banking proof",
        matchType: "all",
        conditions: [{ questionKey: "entityType", operator: "eq", value: "proprietorship" }],
        documents: [
          { slug: "bank-account-statement", mandatory: false, note: "Often requested to evidence business activity." },
        ],
      },
    ],
  },

  "gst-registration": {
    baseDocuments: [
      { slug: "pan-card", mandatory: true, note: "PAN of the business or proprietor." },
      { slug: "aadhaar-card", mandatory: true, note: "Of the primary authorised signatory." },
      { slug: "passport-size-photograph", mandatory: true },
      { slug: "cancelled-cheque", mandatory: true, note: "Or a bank statement showing account details." },
      { slug: "electricity-bill", mandatory: true, note: "As proof of the principal place of business." },
    ],
    conditionalBlocks: [
      {
        label: "Rented premises",
        matchType: "all",
        conditions: [{ questionKey: "premisesOwned", operator: "eq", value: false }],
        documents: [
          { slug: "rent-agreement", mandatory: true },
          { slug: "noc-property-owner", mandatory: true },
        ],
      },
      {
        label: "Registered entities — authorisation",
        matchType: "all",
        conditions: [
          {
            questionKey: "constitution",
            operator: "in",
            value: ["partnership", "llp", "company"],
          },
        ],
        documents: [
          { slug: "board-resolution", mandatory: true, note: "Authorising the signatory. Partnerships may use a letter of authorisation instead." },
        ],
      },
      {
        label: "Partnership constitution proof",
        matchType: "all",
        conditions: [{ questionKey: "constitution", operator: "eq", value: "partnership" }],
        documents: [{ slug: "partnership-deed", mandatory: true }],
      },
      {
        label: "LLP constitution proof",
        matchType: "all",
        conditions: [{ questionKey: "constitution", operator: "eq", value: "llp" }],
        documents: [{ slug: "llp-agreement", mandatory: true }],
      },
      {
        label: "Company constitution proof",
        matchType: "all",
        conditions: [{ questionKey: "constitution", operator: "eq", value: "company" }],
        documents: [
          { slug: "memorandum-of-association", mandatory: true },
          { slug: "articles-of-association", mandatory: true },
        ],
      },
    ],
  },
};

module.exports = { documents, categories, rules };
