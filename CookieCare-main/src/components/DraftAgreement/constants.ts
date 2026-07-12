export const NDA_DOC_CONTENT = `MUTUAL NON-DISCLOSURE AGREEMENT

THIS AGREEMENT is made on [● DATE Insert the date of execution of this Agreement]

BETWEEN:

[● PARTY A NAME Insert full legal name of the first party] a company incorporated under [● JURISDICTION Insert jurisdiction of incorporation] having its registered office at [● REGISTERED ADDRESS Insert complete registered address] (hereinafter referred to as "Party A" which expression shall, unless repugnant to the context or meaning thereof, include its successors and permitted assigns)

AND

[● PARTY B NAME Insert full legal name of the second party] a company incorporated under [● JURISDICTION Insert jurisdiction of incorporation] having its registered office at [● REGISTERED ADDRESS Insert complete registered address] (hereinafter referred to as "Party B" which expression shall, unless repugnant to the context or meaning thereof, include its successors and permitted assigns)

Party A and Party B are hereinafter individually referred to as a "Party" and collectively as the "Parties".

RECITALS:
1. The Parties are exploring a potential business relationship or transaction (the "Purpose").
2. In connection with the Purpose, each Party may disclose proprietary and confidential trade secrets, strategic plans, and technology datasets to the other Party.

Now therefore, the Parties agree as follows:

1. DEFINITIONS & INTERPRETATION

1.1 "Confidential Information" means any and all information disclosed by or on behalf of a Party (the "Disclosing Party") to the other Party (the "Receiving Party") that is marked as confidential or would reasonably be understood to be confidential under the circumstances of disclosure.

2. OBLIGATIONS OF NON-DISCLOSURE

2.1 The Receiving Party shall hold all Confidential Information in strict confidence and shall not, without the prior written consent of the Disclosing Party, disclose, disseminate, or publish such Confidential Information to any third party.

3. INTELLECTUAL PROPERTY RIGHTS

3.1 All Confidential Information disclosed by a Party shall remain the property of the Disclosing Party. Nothing in this Agreement shall be construed as granting any rights, by licence or otherwise, to any Confidential Information or any intellectual property rights therein.

3.2 No licence or other right is granted by this Agreement in respect of any patent, copyright, trade mark, trade secret, or other intellectual property right.

4. RETURN OR DESTRUCTION OF CONFIDENTIAL INFORMATION

4.1 Upon the written request of the Disclosing Party or upon the termination of this Agreement, the Receiving Party shall, at the Disclosing Party's option:
(a) promptly return to the Disclosing Party all documents and materials containing or reflecting any Confidential Information; and/or
(b) destroy all such documents and materials and certify in writing to the Disclosing Party that such destruction has been completed.
`;

export const ARBITRATION_DOC_CONTENT = `IN THE COURT OF [● JURISDICTION Insert the appropriate court jurisdiction, e.g., District Court/High Court and location]

ARBITRATION PETITION NO. [● PETITION NUMBER Insert the petition number assigned by the court registry] OF [● YEAR Insert current year]

UNDER SECTION 11 OF THE ARBITRATION AND CONCILIATION ACT, 1996

IN THE MATTER OF:

An Arbitration Agreement dated [● DATE Insert the date of the contract containing the arbitration clause] between the Petitioner and the Respondent

AND

IN THE MATTER OF:

[● PETITIONER NAME Insert full legal name of the Petitioner] a company incorporated under the laws of India, having its registered office at [● PETITIONER ADDRESS Insert registered office address]
... Petitioner

VERSUS

[● RESPONDENT NAME Insert full legal name of the Respondent] a company incorporated under the laws of India, having its registered office at [● RESPONDENT ADDRESS Insert registered office address]
... Respondent

MOST RESPECTFULLY SHOWETH:

1. The present petition under Section 11 of the Arbitration and Conciliation Act, 1996 is being preferred by the Petitioner seeking appointment of a Sole Arbitrator to adjudicate the severe disputes and claims that have arisen between the parties under the contract dated [● DATE].

2. The Petitioner is a premier enterprise engaged in infrastructural installations and software application support frameworks across public and private segments.

3. The Respondent is a corporate client framework, who executed the Agreement dated [● DATE] for system deployments.

4. Clause 14 of the Agreement provides for standard Governing Arbitration covenants, which reads as under:
"14.1 Disputes arising out of or related to this Agreement shall be referred to arbitration of a Sole Arbitrator to be mutually appointed by the Parties. The venue and seat of arbitration shall be New Delhi, and proceedings conducted in English."
`;

export const DEFAULT_ADVANCED_FIELDS = [
  { id: "party_a", name: "Party A Title", defaultValue: "Lexify Corporate", description: "Disclosing Primary Entity" },
  { id: "party_b", name: "Party B Title", defaultValue: "Vendor Tech Inc.", description: "Receiving technology Vendor" },
  { id: "jurisdiction", name: "Jurisdiction", defaultValue: "Delaware chancery", description: "Standard Governing Law" },
];

export const DEFAULT_ADVANCED_FIELD_VALUES: Record<string, string> = {
  party_a: "Lexify Corporate",
  party_b: "Vendor Tech Inc.",
  jurisdiction: "Delaware chancery",
};
