/**
 * All 28 states + 8 union territories. Served to the frontend so the
 * state-select question type renders one searchable, consistent list
 * instead of each category re-typing its own.
 */
const STATES = [
  { value: "andhra-pradesh", label: "Andhra Pradesh", type: "state" },
  { value: "arunachal-pradesh", label: "Arunachal Pradesh", type: "state" },
  { value: "assam", label: "Assam", type: "state" },
  { value: "bihar", label: "Bihar", type: "state" },
  { value: "chhattisgarh", label: "Chhattisgarh", type: "state" },
  { value: "goa", label: "Goa", type: "state" },
  { value: "gujarat", label: "Gujarat", type: "state" },
  { value: "haryana", label: "Haryana", type: "state" },
  { value: "himachal-pradesh", label: "Himachal Pradesh", type: "state" },
  { value: "jharkhand", label: "Jharkhand", type: "state" },
  { value: "karnataka", label: "Karnataka", type: "state" },
  { value: "kerala", label: "Kerala", type: "state" },
  { value: "madhya-pradesh", label: "Madhya Pradesh", type: "state" },
  { value: "maharashtra", label: "Maharashtra", type: "state" },
  { value: "manipur", label: "Manipur", type: "state" },
  { value: "meghalaya", label: "Meghalaya", type: "state" },
  { value: "mizoram", label: "Mizoram", type: "state" },
  { value: "nagaland", label: "Nagaland", type: "state" },
  { value: "odisha", label: "Odisha", type: "state" },
  { value: "punjab", label: "Punjab", type: "state" },
  { value: "rajasthan", label: "Rajasthan", type: "state" },
  { value: "sikkim", label: "Sikkim", type: "state" },
  { value: "tamil-nadu", label: "Tamil Nadu", type: "state" },
  { value: "telangana", label: "Telangana", type: "state" },
  { value: "tripura", label: "Tripura", type: "state" },
  { value: "uttar-pradesh", label: "Uttar Pradesh", type: "state" },
  { value: "uttarakhand", label: "Uttarakhand", type: "state" },
  { value: "west-bengal", label: "West Bengal", type: "state" },

  { value: "andaman-and-nicobar-islands", label: "Andaman and Nicobar Islands", type: "ut" },
  { value: "chandigarh", label: "Chandigarh", type: "ut" },
  {
    value: "dadra-and-nagar-haveli-and-daman-and-diu",
    label: "Dadra and Nagar Haveli and Daman and Diu",
    type: "ut",
  },
  { value: "delhi", label: "Delhi", type: "ut" },
  { value: "jammu-and-kashmir", label: "Jammu and Kashmir", type: "ut" },
  { value: "ladakh", label: "Ladakh", type: "ut" },
  { value: "lakshadweep", label: "Lakshadweep", type: "ut" },
  { value: "puducherry", label: "Puducherry", type: "ut" },
];

const STATE_VALUES = STATES.map((s) => s.value);

const isValidState = (value) => STATE_VALUES.includes(value);

module.exports = { STATES, STATE_VALUES, isValidState };
