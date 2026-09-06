/**
 * Starter content.
 *
 * IMPORTANT: every rule seeded here is written with verificationStatus
 * "unverified" and lastVerifiedAt null, and no action is published. This data
 * exists to exercise the schema and give the admin CMS something to edit — it
 * is NOT a verified statement of what any government body currently requires,
 * and the fees and timelines below are indicative only. Someone has to sit
 * down with the official sources and confirm each line before publishing.
 *
 * That applies double now that fees and durations are structured numbers. A
 * figure that gets added into a total and printed as "₹3,500" reads as a
 * computed fact in a way that "indicative: around ₹1,500" never did. Anything
 * not confirmed against the official schedule carries `isEstimate: true`, and
 * the ones that don't are the ones that most need checking.
 */

/* ------------------------------------------------------------------ *
 * Documents — the shared registry. Defined once, referenced everywhere.
 * ------------------------------------------------------------------ */

const documents = [
  {
    name: "PAN Card",
    slug: "pan-card",
    description:
      "Permanent Account Number issued by the Income Tax Department. Used as identity and tax proof across most registrations.",
    issuingBody: "Income Tax Department",
    officialUrl: "https://www.incometax.gov.in/iec/foportal/",
    hasExpiry: false,
    copiesRequired: 1,
    attestation: "self-attested",
    obtainedViaSlug: "pan-card",
    obtainedViaAction: "new",
  },
  {
    name: "Aadhaar Card",
    slug: "aadhaar-card",
    description: "12-digit unique identity number issued by UIDAI.",
    issuingBody: "Unique Identification Authority of India (UIDAI)",
    officialUrl: "https://uidai.gov.in/",
    hasExpiry: false,
    copiesRequired: 1,
    attestation: "self-attested",
    obtainedViaSlug: "aadhaar",
    obtainedViaAction: "new",
  },
  {
    name: "Indian Passport",
    slug: "indian-passport",
    description: "Passport issued by the Ministry of External Affairs.",
    issuingBody: "Ministry of External Affairs",
    officialUrl: "https://www.passportindia.gov.in/",
    hasExpiry: true,
    typicalValidity: "10 years (adult)",
    copiesRequired: 1,
    attestation: "self-attested",
    obtainedViaSlug: "passport",
    obtainedViaAction: "new",
  },
  {
    name: "Voter ID (EPIC)",
    slug: "voter-id",
    description: "Elector's Photo Identity Card issued by the Election Commission.",
    issuingBody: "Election Commission of India",
    officialUrl: "https://voters.eci.gov.in/",
    hasExpiry: false,
    copiesRequired: 1,
    attestation: "self-attested",
    obtainedViaSlug: "voter-id",
    obtainedViaAction: "new",
  },
  {
    name: "Driving Licence",
    slug: "driving-licence",
    description: "Licence issued by the state transport authority.",
    issuingBody: "State Transport Department / RTO",
    officialUrl: "https://parivahan.gov.in/",
    hasExpiry: true,
    typicalValidity: "20 years or until age 50, whichever is earlier",
    copiesRequired: 1,
    attestation: "self-attested",
    obtainedViaSlug: "driving-licence",
    obtainedViaAction: "new",
  },
  {
    name: "Ration Card",
    slug: "ration-card",
    description: "Issued by the state food and civil supplies department.",
    issuingBody: "State Food & Civil Supplies Department",
    officialUrl: "https://nfsa.gov.in/",
    hasExpiry: false,
    copiesRequired: 1,
    attestation: "self-attested",
    obtainedViaSlug: "ration-card",
    obtainedViaAction: "new",
  },
  {
    name: "Passport-size Photograph",
    slug: "passport-size-photograph",
    description: "Recent colour photograph against a plain background.",
    issuingBody: "",
    officialUrl: "",
    hasExpiry: false,
    copiesRequired: 2,
    formatNotes: "35x45mm, white or light background, matte finish",
  },
  {
    name: "Birth Certificate",
    slug: "birth-certificate",
    description: "Issued by the municipal corporation or gram panchayat.",
    obtainedViaSlug: "birth-certificate",
    obtainedViaAction: "new",
    issuingBody: "Municipal Corporation / Registrar of Births & Deaths",
    officialUrl: "https://crsorgi.gov.in/",
    hasExpiry: false,
    copiesRequired: 1,
    attestation: "self-attested",
  },
  {
    name: "Class 10 Marksheet / SSC Certificate",
    slug: "tenth-marksheet",
    description: "Commonly accepted as proof of date of birth.",
    issuingBody: "State or Central education board",
    officialUrl: "",
    hasExpiry: false,
    copiesRequired: 1,
    attestation: "self-attested",
  },
  {
    name: "Electricity Bill",
    slug: "electricity-bill",
    description: "Recent utility bill used as proof of address.",
    issuingBody: "State electricity board / DISCOM",
    officialUrl: "",
    hasExpiry: false,
    copiesRequired: 1,
    validityWindow: "Usually must be dated within the last 3 months",
  },
  {
    name: "Water Bill",
    slug: "water-bill",
    description: "Recent water utility bill used as proof of address.",
    issuingBody: "Municipal water department",
    officialUrl: "",
    hasExpiry: false,
    copiesRequired: 1,
    validityWindow: "Usually must be dated within the last 3 months",
  },
  {
    name: "Gas Connection Bill / Book",
    slug: "gas-connection-bill",
    description: "LPG connection document used as proof of address.",
    issuingBody: "LPG distributor",
    officialUrl: "",
    hasExpiry: false,
    copiesRequired: 1,
    validityWindow: "Usually must be dated within the last 3 months",
  },
  {
    name: "Bank Account Statement / Passbook",
    slug: "bank-account-statement",
    description: "Recent statement or passbook page showing name and address.",
    issuingBody: "Applicant's bank",
    officialUrl: "",
    hasExpiry: false,
    copiesRequired: 1,
    validityWindow: "Usually must be dated within the last 3 months",
  },
  {
    name: "Rent Agreement",
    slug: "rent-agreement",
    description: "Registered rental or lease agreement for rented premises.",
    issuingBody: "",
    officialUrl: "",
    hasExpiry: true,
    typicalValidity: "As per agreement term",
    copiesRequired: 1,
  },
  {
    name: "Medical Certificate (Form 1A)",
    slug: "form-1a-medical",
    description:
      "Medical fitness certificate from a registered practitioner, required for certain licence applications.",
    issuingBody: "Registered medical practitioner",
    officialUrl: "https://parivahan.gov.in/",
    hasExpiry: true,
    typicalValidity: "Usually accepted within a limited window of issue",
    copiesRequired: 1,
  },
  {
    name: "Learner's Licence",
    slug: "learners-licence",
    description: "Held for a minimum period before a permanent licence can be applied for.",
    issuingBody: "State Transport Department / RTO",
    officialUrl: "https://parivahan.gov.in/",
    hasExpiry: true,
    typicalValidity: "6 months",
    copiesRequired: 1,
    obtainedViaSlug: "driving-licence",
    obtainedViaAction: "new",
  },
  {
    name: "Police Report / FIR Copy",
    slug: "fir-copy",
    description: "First Information Report, required when a document is lost or stolen.",
    issuingBody: "Local police station",
    officialUrl: "",
    hasExpiry: false,
    copiesRequired: 1,
  },
  {
    name: "Affidavit",
    slug: "affidavit",
    description: "Sworn statement, typically on stamp paper, attested by a notary.",
    issuingBody: "Notary",
    officialUrl: "",
    hasExpiry: false,
    copiesRequired: 1,
    attestation: "notarised",
  },
  {
    name: "Income Certificate",
    slug: "income-certificate",
    obtainedViaSlug: "income-certificate",
    obtainedViaAction: "new",
    description: "Issued by the revenue authority, used for scheme eligibility.",
    issuingBody: "Tehsildar / Revenue Department",
    officialUrl: "",
    hasExpiry: true,
    typicalValidity: "Often 1 year",
    copiesRequired: 1,
  },
  {
    name: "Marriage Certificate",
    slug: "marriage-certificate",
    obtainedViaSlug: "marriage-registration",
    obtainedViaAction: "new",
    description: "Required when applying for a name change after marriage.",
    issuingBody: "Registrar of Marriages",
    officialUrl: "",
    hasExpiry: false,
    copiesRequired: 1,
    attestation: "self-attested",
  },
  {
    name: "Gazette Notification (Name Change)",
    slug: "gazette-name-change",
    obtainedViaSlug: "name-change-gazette",
    obtainedViaAction: "new",
    description: "Official publication of a change of name.",
    issuingBody: "Department of Publication, Government of India",
    officialUrl: "https://egazette.gov.in/",
    hasExpiry: false,
    copiesRequired: 1,
  },
  {
    name: "Cancelled Cheque",
    slug: "cancelled-cheque",
    description: "Used to evidence bank account details.",
    issuingBody: "Applicant's bank",
    officialUrl: "",
    hasExpiry: false,
    copiesRequired: 1,
  },
];

/* ------------------------------------------------------------------ *
 * Services — what a person is trying to get done.
 * ------------------------------------------------------------------ */

const services = [
  {
    label: "Aadhaar",
    slug: "aadhaar",
    description: "Enrol for Aadhaar, or update the details on an existing one.",
    authority: "UIDAI",
    scope: "national",
    icon: "fingerprint",
    order: 1,
    keywords: [
      "aadhaar", "aadhar", "adhar", "adharcard", "aadhaar card", "uidai",
      "aadhaar update", "aadhaar address change", "aadhaar renew",
      "biometric update", "enrolment", "enrollment",
    ],
    actions: [
      {
        key: "new",
        label: "Enrol for a new Aadhaar",
        description: "First-time enrolment for someone who has never had Aadhaar.",
        order: 1,
        questions: [
          {
            key: "applicantAge",
            label: "How old is the person enrolling?",
            type: "single-select",
            required: true,
            order: 1,
            options: [
              { value: "under-5", label: "Under 5 years" },
              { value: "5-to-17", label: "5 to 17 years" },
              { value: "adult", label: "18 or older" },
            ],
          },
        ],
      },
      {
        key: "update",
        label: "Update details on my Aadhaar",
        description:
          "Change address, name, date of birth, mobile number or biometrics. Aadhaar does not expire — what people call renewing is usually an update.",
        order: 2,
        questions: [
          {
            key: "whatToUpdate",
            label: "What do you need to change?",
            type: "multi-select",
            helpText: "Choose everything that applies — the list adapts.",
            required: true,
            order: 1,
            options: [
              { value: "address", label: "Address" },
              { value: "name", label: "Name" },
              { value: "dob", label: "Date of birth" },
              { value: "mobile", label: "Mobile number or email" },
              { value: "biometric", label: "Photo or biometrics" },
            ],
          },
          {
            key: "nameChangeReason",
            label: "Why is the name changing?",
            type: "single-select",
            required: false,
            order: 2,
            options: [
              { value: "marriage", label: "Marriage" },
              { value: "spelling", label: "Spelling correction" },
              { value: "legal", label: "Legal change of name" },
            ],
          },
        ],
      },
    ],
  },

  {
    label: "PAN Card",
    slug: "pan-card",
    description: "Apply for a PAN, correct details on it, or get a reprint.",
    authority: "Income Tax Department",
    scope: "national",
    icon: "credit-card",
    order: 2,
    keywords: [
      "pan", "pan card", "pancard", "permanent account number",
      "pan correction", "pan reprint", "lost pan", "tax card",
    ],
    actions: [
      {
        key: "new",
        label: "Apply for a new PAN",
        order: 1,
        questions: [
          {
            key: "applicantType",
            label: "Who is the PAN for?",
            type: "single-select",
            required: true,
            order: 1,
            options: [
              { value: "individual", label: "An individual" },
              { value: "huf", label: "A Hindu Undivided Family (HUF)" },
              { value: "company", label: "A company or firm" },
            ],
          },
        ],
      },
      {
        key: "correction",
        label: "Correct a mistake on my PAN",
        order: 2,
        questions: [
          {
            key: "whatToCorrect",
            label: "What is wrong?",
            type: "multi-select",
            required: true,
            order: 1,
            options: [
              { value: "name", label: "Name" },
              { value: "dob", label: "Date of birth" },
              { value: "photo", label: "Photo or signature" },
            ],
          },
        ],
      },
      {
        key: "replace",
        label: "Replace a lost or damaged PAN",
        order: 3,
        questions: [],
      },
    ],
  },

  {
    label: "Passport",
    slug: "passport",
    description: "Apply for a first passport, re-issue an expiring one, or replace a lost one.",
    authority: "Ministry of External Affairs",
    scope: "national",
    icon: "book-user",
    order: 3,
    keywords: [
      "passport", "pasport", "passport renew", "passport renewal",
      "reissue passport", "re-issue", "lost passport", "travel document",
      "passport seva",
    ],
    actions: [
      {
        key: "new",
        label: "Apply for a first passport",
        order: 1,
        questions: [
          {
            key: "applicantAge",
            label: "Is the applicant a minor?",
            type: "boolean",
            helpText: "Minors (under 18) need parent documents instead of some of their own.",
            required: true,
            order: 1,
          },
          {
            key: "scheme",
            label: "Normal or Tatkal?",
            type: "single-select",
            required: true,
            order: 2,
            options: [
              { value: "normal", label: "Normal" },
              { value: "tatkal", label: "Tatkal (faster, costs more)" },
            ],
          },
        ],
      },
      {
        key: "renew",
        label: "Renew / re-issue my passport",
        description: "For a passport that has expired or is close to expiring.",
        order: 2,
        questions: [
          {
            key: "detailsChanged",
            label: "Have any of your details changed since it was issued?",
            type: "boolean",
            helpText: "Name, address, or date of birth.",
            required: true,
            order: 1,
          },
        ],
      },
      {
        key: "replace",
        label: "Replace a lost or damaged passport",
        order: 3,
        questions: [],
      },
    ],
  },

  {
    label: "Driving Licence",
    slug: "driving-licence",
    description: "Apply for a learner's or permanent licence, renew, or get a duplicate.",
    authority: "State Transport Department / RTO",
    scope: "national",
    icon: "car",
    order: 4,
    keywords: [
      "driving licence", "driving license", "dl", "licence", "license",
      "learner", "learners licence", "rto", "renew licence", "duplicate licence",
      "parivahan",
    ],
    actions: [
      {
        key: "new",
        label: "Apply for a new licence",
        order: 1,
        questions: [
          {
            key: "licenceStage",
            label: "Which stage are you at?",
            type: "single-select",
            required: true,
            order: 1,
            options: [
              { value: "learner", label: "Applying for a learner's licence" },
              { value: "permanent", label: "Converting a learner's to permanent" },
            ],
          },
          {
            key: "vehicleClass",
            label: "What will you be driving?",
            type: "single-select",
            required: true,
            order: 2,
            options: [
              { value: "two-wheeler", label: "Two-wheeler" },
              { value: "lmv", label: "Car (LMV)" },
              { value: "transport", label: "Commercial / transport vehicle" },
            ],
          },
        ],
      },
      {
        key: "renew",
        label: "Renew my licence",
        order: 2,
        questions: [
          {
            key: "over50",
            label: "Are you 50 or older?",
            type: "boolean",
            helpText: "A medical certificate is generally required past this age.",
            required: true,
            order: 1,
          },
        ],
      },
      {
        key: "replace",
        label: "Replace a lost or damaged licence",
        order: 3,
        questions: [],
      },
    ],
  },

  {
    label: "Voter ID",
    slug: "voter-id",
    description: "Register as a voter, correct your details, or replace a lost card.",
    authority: "Election Commission of India",
    scope: "national",
    icon: "vote",
    order: 5,
    keywords: [
      "voter", "voter id", "voter card", "epic", "election card",
      "voter registration", "electoral roll", "form 6",
    ],
    actions: [
      {
        key: "new",
        label: "Register as a new voter",
        order: 1,
        questions: [],
      },
      {
        key: "correction",
        label: "Correct my details",
        order: 2,
        questions: [
          {
            key: "whatToCorrect",
            label: "What needs correcting?",
            type: "multi-select",
            required: true,
            order: 1,
            options: [
              { value: "name", label: "Name" },
              { value: "address", label: "Address" },
              { value: "dob", label: "Date of birth or age" },
              { value: "photo", label: "Photograph" },
            ],
          },
        ],
      },
    ],
  },

  {
    label: "Ration Card",
    slug: "ration-card",
    description: "Apply for a ration card or update the members on it.",
    authority: "State Food & Civil Supplies Department",
    scope: "state",
    icon: "wheat",
    order: 6,
    // Deliberately a short list — a state should only appear once someone has
    // actually checked that state's process.
    availableStates: ["gujarat", "maharashtra", "rajasthan", "delhi"],
    keywords: [
      "ration card", "ration", "nfsa", "food card", "bpl card", "apl card",
      "public distribution", "pds",
    ],
    actions: [
      {
        key: "new",
        label: "Apply for a new ration card",
        order: 1,
        questions: [
          {
            key: "householdType",
            label: "Which category do you fall under?",
            type: "single-select",
            required: true,
            order: 1,
            options: [
              { value: "priority", label: "Priority household (NFSA)" },
              { value: "antyodaya", label: "Antyodaya (AAY)" },
              { value: "general", label: "General / non-subsidised" },
            ],
          },
        ],
      },
      {
        key: "update",
        label: "Add or remove a family member",
        order: 2,
        questions: [
          {
            key: "changeType",
            label: "What are you changing?",
            type: "single-select",
            required: true,
            order: 1,
            options: [
              { value: "add", label: "Adding a member" },
              { value: "remove", label: "Removing a member" },
            ],
          },
        ],
      },
    ],
  },

  {
    label: "MA Card (Mukhyamantri Amrutam Yojana)",
    slug: "ma-card",
    description:
      "Gujarat's health assistance scheme card, covering treatment at empanelled hospitals.",
    authority: "Government of Gujarat, Health & Family Welfare Department",
    scope: "state",
    availableStates: ["gujarat"],
    icon: "heart-pulse",
    order: 7,
    keywords: [
      "ma card", "ma yojana", "mukhyamantri amrutam", "ma vatsalya",
      "amrutam", "health card gujarat", "ayushman gujarat",
    ],
    actions: [
      {
        key: "new",
        label: "Apply for a new MA Card",
        order: 1,
        questions: [
          {
            key: "schemeCategory",
            label: "Which category are you applying under?",
            type: "single-select",
            required: true,
            order: 1,
            options: [
              { value: "ma", label: "MA (below the income threshold)" },
              { value: "ma-vatsalya", label: "MA Vatsalya (extended income band)" },
            ],
          },
        ],
      },
      {
        key: "renew",
        label: "Renew my MA Card",
        order: 2,
        questions: [],
      },
    ],
  },

  {
    label: "Register a Business",
    slug: "register-a-business",
    description: "Documents typically required to incorporate or register a business entity.",
    authority: "Ministry of Corporate Affairs / State Registrar",
    scope: "national",
    icon: "building",
    order: 8,
    keywords: [
      "register a business", "business registration", "company registration",
      "incorporate", "incorporation", "start a company", "private limited",
      "pvt ltd", "llp", "partnership firm", "sole proprietorship",
      "udyam", "msme", "small business",
    ],
    actions: [
      {
        key: "new",
        label: "Register a new business",
        order: 1,
        questions: [
          {
            key: "entityType",
            label: "What kind of entity are you registering?",
            type: "single-select",
            required: true,
            order: 1,
            options: [
              { value: "private-limited", label: "Private Limited Company" },
              { value: "llp", label: "Limited Liability Partnership (LLP)" },
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
            order: 2,
          },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Rules — keyed by service slug, action, and optionally state.
 * A `state` of null is the national default.
 * ------------------------------------------------------------------ */

const rules = [
  /* ---------------- Aadhaar ---------------- */
  {
    serviceSlug: "aadhaar",
    action: "new",
    state: null,
    baseDocuments: [
      { slug: "passport-size-photograph", mandatory: false, note: "Captured at the enrolment centre; a copy is rarely needed." },
      { slug: "electricity-bill", mandatory: true, note: "Any accepted proof of address." },
    ],
    conditionalBlocks: [
      {
        label: "Children under 5",
        matchType: "all",
        conditions: [{ questionKey: "applicantAge", operator: "eq", value: "under-5" }],
        documents: [
          { slug: "birth-certificate", mandatory: true },
          { slug: "aadhaar-card", mandatory: true, belongsTo: "parent", note: "The child is linked to a parent's Aadhaar at enrolment." },
        ],
      },
      {
        label: "Age 5 to 17",
        matchType: "all",
        conditions: [{ questionKey: "applicantAge", operator: "eq", value: "5-to-17" }],
        documents: [
          { slug: "birth-certificate", mandatory: true },
          { slug: "tenth-marksheet", mandatory: false, note: "Accepted as date-of-birth proof if available." },
        ],
      },
      {
        label: "Adults",
        matchType: "all",
        conditions: [{ questionKey: "applicantAge", operator: "eq", value: "adult" }],
        documents: [
          { slug: "pan-card", mandatory: false, note: "One accepted identity proof." },
          { slug: "voter-id", mandatory: false, note: "Alternative identity proof." },
        ],
      },
    ],
    processSteps: [
      { title: "Book an appointment", detail: "Find and book a slot at an Aadhaar Seva Kendra.", mode: "online", url: "https://appointments.uidai.gov.in/", order: 1 },
      { title: "Visit the centre with your documents", detail: "Originals are checked and returned.", mode: "in-person", fees: [{ label: "First enrolment", amount: 0, order: 1 }], order: 2 },
      { title: "Give biometrics", detail: "Photograph, fingerprints and iris scan are captured.", mode: "in-person", order: 3 },
      { title: "Collect the acknowledgement slip", detail: "Keep the enrolment ID to track status.", mode: "in-person", minDays: 30, maxDays: 90, order: 4 },
    ],
  },
  {
    serviceSlug: "aadhaar",
    action: "update",
    state: null,
    baseDocuments: [
      { slug: "aadhaar-card", mandatory: true, note: "Your existing Aadhaar number." },
    ],
    conditionalBlocks: [
      {
        label: "Address change",
        matchType: "all",
        conditions: [{ questionKey: "whatToUpdate", operator: "contains", value: "address" }],
        documents: [
          { slug: "electricity-bill", mandatory: true, note: "Or any other accepted proof of address." },
          { slug: "rent-agreement", mandatory: false, note: "Accepted if you are renting." },
          { slug: "bank-account-statement", mandatory: false, note: "Alternative address proof." },
        ],
      },
      {
        label: "Name change",
        matchType: "all",
        conditions: [{ questionKey: "whatToUpdate", operator: "contains", value: "name" }],
        documents: [{ slug: "pan-card", mandatory: false, note: "One accepted proof of the correct name." }],
      },
      {
        label: "Name change after marriage",
        matchType: "all",
        conditions: [{ questionKey: "nameChangeReason", operator: "eq", value: "marriage" }],
        documents: [{ slug: "marriage-certificate", mandatory: true }],
      },
      {
        label: "Legal name change",
        matchType: "all",
        conditions: [{ questionKey: "nameChangeReason", operator: "eq", value: "legal" }],
        documents: [{ slug: "gazette-name-change", mandatory: true }],
      },
      {
        label: "Date of birth correction",
        matchType: "all",
        conditions: [{ questionKey: "whatToUpdate", operator: "contains", value: "dob" }],
        documents: [
          { slug: "birth-certificate", mandatory: true },
          { slug: "tenth-marksheet", mandatory: false, note: "Often accepted in place of a birth certificate." },
        ],
      },
    ],
    processSteps: [
      { title: "Check what can be done online", detail: "Address updates can usually be done through myAadhaar; biometrics cannot.", mode: "online", url: "https://myaadhaar.uidai.gov.in/", order: 1 },
      { title: "Submit the update request", mode: "either", fees: [{ label: "Demographic update", amount: 50, isEstimate: true, order: 1 }], order: 2 },
      { title: "Keep the URN", detail: "The Update Request Number is how you track it.", mode: "either", minDays: 14, maxDays: 30, order: 3 },
    ],
  },

  /* ---------------- PAN ---------------- */
  {
    serviceSlug: "pan-card",
    action: "new",
    state: null,
    baseDocuments: [
      { slug: "aadhaar-card", mandatory: true, note: "Used for identity, address and date-of-birth proof." },
      { slug: "passport-size-photograph", mandatory: true },
    ],
    conditionalBlocks: [
      {
        label: "Individuals",
        matchType: "all",
        conditions: [{ questionKey: "applicantType", operator: "eq", value: "individual" }],
        documents: [{ slug: "birth-certificate", mandatory: false, note: "Alternative date-of-birth proof if Aadhaar is not used." }],
      },
      {
        label: "Companies and firms",
        matchType: "all",
        conditions: [{ questionKey: "applicantType", operator: "eq", value: "company" }],
        documents: [
          { slug: "cancelled-cheque", mandatory: false },
          { slug: "electricity-bill", mandatory: true, note: "Proof of the registered office address." },
        ],
      },
    ],
    processSteps: [
      { title: "Apply online", detail: "Through the Income Tax e-filing portal or an authorised agency.", mode: "online", url: "https://www.incometax.gov.in/iec/foportal/", order: 1 },
      { title: "Complete e-KYC or send documents", mode: "either", order: 2 },
      { title: "Pay the fee", mode: "online", fees: [{ label: "Application fee (Indian address)", amount: 107, isEstimate: true, order: 1 }], order: 3 },
      { title: "Receive your PAN", detail: "The e-PAN arrives well before the physical card does.", mode: "either", minDays: 15, maxDays: 20, order: 4 },
    ],
  },
  {
    serviceSlug: "pan-card",
    action: "correction",
    state: null,
    baseDocuments: [
      { slug: "pan-card", mandatory: true, note: "Copy of the existing PAN." },
      { slug: "aadhaar-card", mandatory: true },
      { slug: "passport-size-photograph", mandatory: true },
    ],
    conditionalBlocks: [
      {
        label: "Date of birth correction",
        matchType: "all",
        conditions: [{ questionKey: "whatToCorrect", operator: "contains", value: "dob" }],
        documents: [{ slug: "birth-certificate", mandatory: true }],
      },
      {
        label: "Name correction",
        matchType: "all",
        conditions: [{ questionKey: "whatToCorrect", operator: "contains", value: "name" }],
        documents: [{ slug: "marriage-certificate", mandatory: false, note: "If the change follows marriage." }],
      },
    ],
    processSteps: [
      { title: "Submit a correction request", mode: "online", url: "https://www.incometax.gov.in/iec/foportal/", order: 1 },
      { title: "Pay the processing fee", mode: "online", fees: [{ label: "Correction fee", amount: 107, isEstimate: true, order: 1 }], minDays: 15, maxDays: 20, order: 2 },
    ],
  },
  {
    serviceSlug: "pan-card",
    action: "replace",
    state: null,
    baseDocuments: [
      { slug: "aadhaar-card", mandatory: true },
      { slug: "passport-size-photograph", mandatory: true },
      { slug: "fir-copy", mandatory: false, note: "Advisable if the card was stolen." },
    ],
    conditionalBlocks: [],
    processSteps: [
      { title: "Request a reprint", detail: "Your PAN number stays the same — only the card is reissued.", mode: "online", url: "https://www.incometax.gov.in/iec/foportal/", fees: [{ label: "Reprint fee", amount: 50, isEstimate: true, order: 1 }], minDays: 15, maxDays: 20, order: 1 },
    ],
  },

  /* ---------------- Passport ---------------- */
  {
    serviceSlug: "passport",
    action: "new",
    state: null,
    baseDocuments: [
      { slug: "aadhaar-card", mandatory: true },
      { slug: "birth-certificate", mandatory: true, note: "Or another accepted date-of-birth proof." },
      { slug: "electricity-bill", mandatory: true, note: "Proof of present address." },
      { slug: "passport-size-photograph", mandatory: false, note: "Usually captured at the Seva Kendra." },
    ],
    conditionalBlocks: [
      {
        label: "Minor applicants",
        matchType: "all",
        conditions: [{ questionKey: "applicantAge", operator: "eq", value: true }],
        documents: [
          { slug: "indian-passport", mandatory: false, belongsTo: "parent", note: "Both parents' passports, if they hold them." },
          { slug: "affidavit", mandatory: false, note: "Annexure D, signed by both parents." },
        ],
      },
      {
        label: "Adult applicants",
        matchType: "all",
        conditions: [{ questionKey: "applicantAge", operator: "eq", value: false }],
        documents: [
          { slug: "pan-card", mandatory: false, note: "Additional identity proof." },
          { slug: "voter-id", mandatory: false, note: "Additional identity proof." },
        ],
      },
      {
        label: "Tatkal applications",
        matchType: "all",
        conditions: [{ questionKey: "scheme", operator: "eq", value: "tatkal" }],
        documents: [{ slug: "affidavit", mandatory: true, note: "Verification annexure required under Tatkal." }],
      },
    ],
    processSteps: [
      { title: "Register on Passport Seva", mode: "online", url: "https://www.passportindia.gov.in/", order: 1 },
      {
        title: "Fill the form and pay",
        mode: "online",
        order: 2,
        // Three lines, two of them gated: an adult on the normal route sees
        // ₹1,500, a minor sees ₹1,000, and only a Tatkal applicant is shown
        // the surcharge. Nobody is asked to work out which row is theirs.
        fees: [
          {
            label: "Application fee (36-page, 10-year)",
            amount: 1500,
            order: 1,
            conditions: [{ questionKey: "applicantAge", operator: "eq", value: false }],
          },
          {
            label: "Application fee (minor, 36-page, 5-year)",
            amount: 1000,
            order: 1,
            conditions: [{ questionKey: "applicantAge", operator: "eq", value: true }],
          },
          {
            label: "Tatkal surcharge",
            amount: 2000,
            order: 2,
            conditions: [{ questionKey: "scheme", operator: "eq", value: "tatkal" }],
          },
        ],
      },
      { title: "Book an appointment at a PSK or POPSK", mode: "online", order: 3 },
      { title: "Attend with original documents", detail: "Originals are verified and returned.", mode: "in-person", order: 4 },
      // Two steps rather than one with a caveat: the durations differ by an
      // order of magnitude, and a caveat in prose is not something a deadline
      // can be planned against.
      {
        title: "Police verification",
        detail: "Carried out at your registered address after the appointment.",
        mode: "in-person",
        minDays: 21,
        maxDays: 42,
        order: 5,
        conditions: [{ questionKey: "scheme", operator: "eq", value: "normal" }],
      },
      {
        title: "Post-issue police verification",
        detail: "Tatkal issues the passport first and verifies afterwards.",
        mode: "in-person",
        minDays: 3,
        maxDays: 7,
        order: 5,
        conditions: [{ questionKey: "scheme", operator: "eq", value: "tatkal" }],
      },
    ],
  },
  {
    serviceSlug: "passport",
    action: "renew",
    state: null,
    baseDocuments: [
      { slug: "indian-passport", mandatory: true, note: "Your existing passport, original plus a self-attested copy of the first and last pages." },
      { slug: "aadhaar-card", mandatory: true },
      { slug: "electricity-bill", mandatory: true, note: "Proof of current address." },
    ],
    conditionalBlocks: [
      {
        label: "Details have changed",
        matchType: "all",
        conditions: [{ questionKey: "detailsChanged", operator: "eq", value: true }],
        documents: [
          { slug: "marriage-certificate", mandatory: false, note: "If your name changed on marriage." },
          { slug: "gazette-name-change", mandatory: false, note: "For a legal change of name." },
        ],
      },
    ],
    processSteps: [
      { title: "Apply for re-issue on Passport Seva", mode: "online", url: "https://www.passportindia.gov.in/", order: 1 },
      { title: "Pay the fee and book an appointment", mode: "online", fees: [{ label: "Re-issue fee (36-page, 10-year)", amount: 1500, isEstimate: true, order: 1 }], order: 2 },
      { title: "Attend the appointment", detail: "Usually faster than a first application — police verification is often not repeated.", mode: "in-person", minDays: 15, maxDays: 30, order: 3 },
    ],
  },
  {
    serviceSlug: "passport",
    action: "replace",
    state: null,
    baseDocuments: [
      { slug: "fir-copy", mandatory: true, note: "Police report for the lost or stolen passport." },
      { slug: "aadhaar-card", mandatory: true },
      { slug: "affidavit", mandatory: true, note: "Declaration explaining the loss." },
      { slug: "electricity-bill", mandatory: true, note: "Proof of current address." },
    ],
    conditionalBlocks: [],
    processSteps: [
      { title: "File a police report", mode: "in-person", order: 1 },
      { title: "Apply for re-issue citing loss", mode: "online", url: "https://www.passportindia.gov.in/", order: 2 },
    ],
  },

  /* ---------------- Driving Licence ---------------- */
  {
    serviceSlug: "driving-licence",
    action: "new",
    state: null,
    baseDocuments: [
      { slug: "aadhaar-card", mandatory: true },
      { slug: "passport-size-photograph", mandatory: true },
      { slug: "electricity-bill", mandatory: true, note: "Proof of address in the RTO's jurisdiction." },
      { slug: "birth-certificate", mandatory: true, note: "Or another accepted age proof." },
    ],
    conditionalBlocks: [
      {
        label: "Converting a learner's licence",
        matchType: "all",
        conditions: [{ questionKey: "licenceStage", operator: "eq", value: "permanent" }],
        documents: [{ slug: "learners-licence", mandatory: true, note: "Usually must be at least 30 days old." }],
      },
      {
        label: "Commercial vehicles",
        matchType: "all",
        conditions: [{ questionKey: "vehicleClass", operator: "eq", value: "transport" }],
        documents: [{ slug: "form-1a-medical", mandatory: true }],
      },
    ],
    processSteps: [
      { title: "Apply on Parivahan Sarathi", mode: "online", url: "https://sarathi.parivahan.gov.in/", order: 1 },
      { title: "Pay the fee and book a slot", mode: "online", fees: [{ label: "Learner's licence fee", amount: 150, isEstimate: true, order: 1 }, { label: "Test fee", amount: 50, isEstimate: true, order: 2 }], fee: "Varies by state and vehicle class", order: 2 },
      { title: "Take the test", detail: "Written test for a learner's; driving test for a permanent licence.", mode: "in-person", minDays: 1, maxDays: 30, order: 3 },
    ],
  },
  {
    serviceSlug: "driving-licence",
    action: "renew",
    state: null,
    baseDocuments: [
      { slug: "driving-licence", mandatory: true, note: "Your existing licence." },
      { slug: "aadhaar-card", mandatory: true },
      { slug: "passport-size-photograph", mandatory: true },
    ],
    conditionalBlocks: [
      {
        label: "Applicants aged 50 or older",
        matchType: "all",
        conditions: [{ questionKey: "over50", operator: "eq", value: true }],
        documents: [{ slug: "form-1a-medical", mandatory: true }],
      },
    ],
    processSteps: [
      { title: "Apply for renewal on Parivahan", mode: "online", url: "https://sarathi.parivahan.gov.in/", order: 1 },
      { title: "Visit the RTO if required", mode: "in-person", fees: [{ label: "Renewal fee", amount: 200, isEstimate: true, order: 1 }], minDays: 7, maxDays: 30, fee: "Varies by state", order: 2 },
    ],
  },
  {
    serviceSlug: "driving-licence",
    action: "replace",
    state: null,
    baseDocuments: [
      { slug: "fir-copy", mandatory: true, note: "If the licence was lost or stolen." },
      { slug: "aadhaar-card", mandatory: true },
      { slug: "passport-size-photograph", mandatory: true },
    ],
    conditionalBlocks: [],
    processSteps: [
      { title: "Apply for a duplicate licence", mode: "online", url: "https://sarathi.parivahan.gov.in/", order: 1 },
    ],
  },

  /* ---------------- Voter ID ---------------- */
  {
    serviceSlug: "voter-id",
    action: "new",
    state: null,
    baseDocuments: [
      { slug: "aadhaar-card", mandatory: true },
      { slug: "passport-size-photograph", mandatory: true },
      { slug: "electricity-bill", mandatory: true, note: "Proof of ordinary residence in the constituency." },
      { slug: "birth-certificate", mandatory: true, note: "Or another accepted age proof." },
    ],
    conditionalBlocks: [],
    processSteps: [
      { title: "Submit Form 6", mode: "online", url: "https://voters.eci.gov.in/", fees: [{ label: "Enrolment", amount: 0, order: 1 }], order: 1 },
      { title: "Booth Level Officer verification", mode: "in-person", minDays: 21, maxDays: 60, order: 2 },
    ],
  },
  {
    serviceSlug: "voter-id",
    action: "correction",
    state: null,
    baseDocuments: [
      { slug: "voter-id", mandatory: true, note: "Your existing EPIC." },
      { slug: "aadhaar-card", mandatory: true },
    ],
    conditionalBlocks: [
      {
        label: "Address correction",
        matchType: "all",
        conditions: [{ questionKey: "whatToCorrect", operator: "contains", value: "address" }],
        documents: [{ slug: "electricity-bill", mandatory: true }],
      },
      {
        label: "Photograph change",
        matchType: "all",
        conditions: [{ questionKey: "whatToCorrect", operator: "contains", value: "photo" }],
        documents: [{ slug: "passport-size-photograph", mandatory: true }],
      },
      {
        label: "Date of birth correction",
        matchType: "all",
        conditions: [{ questionKey: "whatToCorrect", operator: "contains", value: "dob" }],
        documents: [{ slug: "birth-certificate", mandatory: true }],
      },
    ],
    processSteps: [
      { title: "Submit Form 8", mode: "online", url: "https://voters.eci.gov.in/", fees: [{ label: "Update", amount: 0, order: 1 }], order: 1 },
    ],
  },

  /* ---------------- Ration Card (state-scoped) ---------------- */
  {
    serviceSlug: "ration-card",
    action: "new",
    state: null,
    baseDocuments: [
      { slug: "aadhaar-card", mandatory: true, note: "For every member of the household." },
      { slug: "electricity-bill", mandatory: true, note: "Proof of residence." },
      { slug: "passport-size-photograph", mandatory: true, note: "Of the head of the household." },
      { slug: "bank-account-statement", mandatory: false },
    ],
    conditionalBlocks: [
      {
        label: "Subsidised categories",
        matchType: "any",
        conditions: [
          { questionKey: "householdType", operator: "eq", value: "priority" },
          { questionKey: "householdType", operator: "eq", value: "antyodaya" },
        ],
        documents: [{ slug: "income-certificate", mandatory: true }],
      },
    ],
    processSteps: [
      { title: "Apply through your state's food department portal", mode: "either", url: "https://nfsa.gov.in/", order: 1 },
      { title: "Verification by the local supply office", mode: "in-person", minDays: 15, maxDays: 45, timeline: "Varies by state", order: 2 },
    ],
  },
  {
    // Demonstrates a state override: Gujarat's process runs through Digital
    // Gujarat rather than the generic state portal.
    serviceSlug: "ration-card",
    action: "new",
    state: "gujarat",
    baseDocuments: [
      { slug: "aadhaar-card", mandatory: true, note: "For every member of the household." },
      { slug: "electricity-bill", mandatory: true, note: "Proof of residence." },
      { slug: "passport-size-photograph", mandatory: true, note: "Of the head of the household." },
      { slug: "bank-account-statement", mandatory: true },
    ],
    conditionalBlocks: [
      {
        label: "Subsidised categories",
        matchType: "any",
        conditions: [
          { questionKey: "householdType", operator: "eq", value: "priority" },
          { questionKey: "householdType", operator: "eq", value: "antyodaya" },
        ],
        documents: [{ slug: "income-certificate", mandatory: true }],
      },
    ],
    processSteps: [
      { title: "Apply through Digital Gujarat", mode: "online", url: "https://www.digitalgujarat.gov.in/", order: 1 },
      { title: "Verification at the mamlatdar office", mode: "in-person", order: 2 },
    ],
  },
  {
    serviceSlug: "ration-card",
    action: "update",
    state: null,
    baseDocuments: [
      { slug: "ration-card", mandatory: true, note: "Your existing card." },
      { slug: "aadhaar-card", mandatory: true, note: "Of the member being added or removed." },
    ],
    conditionalBlocks: [
      {
        label: "Adding a member",
        matchType: "all",
        conditions: [{ questionKey: "changeType", operator: "eq", value: "add" }],
        documents: [
          { slug: "birth-certificate", mandatory: false, note: "For a newborn." },
          { slug: "marriage-certificate", mandatory: false, note: "When adding a spouse." },
        ],
      },
    ],
    processSteps: [
      { title: "Submit the change request", mode: "either", url: "https://nfsa.gov.in/", order: 1 },
    ],
  },

  /* ---------------- MA Card (Gujarat only) ---------------- */
  {
    serviceSlug: "ma-card",
    action: "new",
    state: "gujarat",
    baseDocuments: [
      { slug: "aadhaar-card", mandatory: true, note: "For every member to be covered." },
      { slug: "ration-card", mandatory: true },
      { slug: "income-certificate", mandatory: true },
      { slug: "passport-size-photograph", mandatory: true },
      { slug: "electricity-bill", mandatory: true, note: "Proof of residence in Gujarat." },
    ],
    conditionalBlocks: [
      {
        label: "MA Vatsalya applicants",
        matchType: "all",
        conditions: [{ questionKey: "schemeCategory", operator: "eq", value: "ma-vatsalya" }],
        documents: [{ slug: "income-certificate", mandatory: true, note: "Must show income within the MA Vatsalya band." }],
      },
    ],
    processSteps: [
      { title: "Visit a designated kiosk", detail: "Civic centres, taluka offices and some hospitals enrol applicants.", mode: "in-person", order: 1 },
      { title: "Verification and biometric capture", mode: "in-person", fees: [{ label: "Enrolment", amount: 0, order: 1 }], minDays: 7, maxDays: 21, order: 2 },
      { title: "Collect the card", mode: "in-person", order: 3 },
    ],
  },
  {
    serviceSlug: "ma-card",
    action: "renew",
    state: "gujarat",
    baseDocuments: [
      { slug: "aadhaar-card", mandatory: true },
      { slug: "income-certificate", mandatory: true, note: "Current certificate — eligibility is re-checked." },
    ],
    conditionalBlocks: [],
    processSteps: [
      { title: "Visit a designated kiosk with your existing card", mode: "in-person", fees: [{ label: "Renewal", amount: 0, order: 1 }], order: 1 },
    ],
  },

  /* ---------------- Register a Business ---------------- */
  {
    serviceSlug: "register-a-business",
    action: "new",
    state: null,
    baseDocuments: [
      { slug: "pan-card", mandatory: true, note: "For all directors, partners or the proprietor." },
      { slug: "aadhaar-card", mandatory: true, note: "For all directors, partners or the proprietor." },
      { slug: "passport-size-photograph", mandatory: true },
      { slug: "electricity-bill", mandatory: true, note: "Proof of the registered office address." },
    ],
    conditionalBlocks: [
      {
        label: "Rented premises",
        matchType: "all",
        conditions: [{ questionKey: "premisesOwned", operator: "eq", value: false }],
        documents: [{ slug: "rent-agreement", mandatory: true }],
      },
      {
        label: "Proprietorship banking proof",
        matchType: "all",
        conditions: [{ questionKey: "entityType", operator: "eq", value: "proprietorship" }],
        documents: [{ slug: "bank-account-statement", mandatory: false, note: "Often requested to evidence business activity." }],
      },
      {
        label: "Partnerships",
        matchType: "all",
        conditions: [{ questionKey: "entityType", operator: "eq", value: "partnership" }],
        documents: [{ slug: "affidavit", mandatory: false, note: "Partnership deed, executed on stamp paper." }],
      },
    ],
    processSteps: [
      { title: "Choose your entity type", mode: "online", order: 1 },
      { title: "Reserve a name", mode: "online", url: "https://www.mca.gov.in/", order: 2 },
      { title: "File the incorporation application", mode: "online", url: "https://www.mca.gov.in/", order: 3 },
    ],
  },
];

module.exports = { documents, services, rules };
