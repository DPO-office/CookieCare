const hay =
  "at mastercard's sole option, securely delete existing copies of the personal data or return the same".toLowerCase();
const g1 = [
  "delete or return",
  "return or delete",
  "return and delete",
  "delete and return",
  "at the choice",
  "at the option",
  "controller's choice",
  "controller's option",
  "controller may elect",
  "as instructed by the controller",
  "as directed by the controller",
  "at the customer's option",
  "customer's choice",
  "sole option",
];
console.log(
  "G1 hits",
  g1.filter((t) => hay.includes(t))
);

const g4hay =
  "unless any applicable law requires storage".toLowerCase();
const g4d = [
  "unless required by",
  "except as required by",
  "except to the extent required",
  "required by union or member state law",
  "otherwise required by law",
  "statutory retention",
  "required by applicable law to retain",
  "required to retain",
];
console.log(
  "G4 distinctive",
  g4d.filter((t) => g4hay.includes(t))
);
const groups = [
  ["unless", "except", "save", "provided that", "to the extent"],
  [
    "retain",
    "retention",
    "store",
    "storage",
    "keep",
    "maintain",
    "hold",
    "preserve",
  ],
  [
    "law",
    "laws",
    "statute",
    "statutory",
    "regulation",
    "regulatory",
    "legal obligation",
    "member state",
    "union law",
    "applicable law",
  ],
];
console.log(
  "G4 groups",
  groups.map((g) => g.some((t) => g4hay.includes(t)))
);

const fhay =
  "conducting data protection impact assessments and consultations and other interactions with competent government bodies".toLowerCase();
const fd = [
  "dpia",
  "impact assessment",
  "prior consultation",
  "article 35",
  "article 36",
  "data protection impact",
];
console.log(
  "F3 distinctive",
  fd.filter((t) => fhay.includes(t))
);

// Why might F3 still fail? Check if "consult" alone is enough in required groups
// but distinctive gate is separate - impact assessment should pass
