# Temp: compliance pre-report (`latest.json` only)

Silent dump. No console. One file:

`backend/src/modules/analysis/temp/compliance-pre-report/out/latest.json`

## Contents

| Key | Meaning |
|---|---|
| `whatSystemDid` | Checks, investigation bundles, proposed verify/assess/lock outcomes, shadow comparison |
| `handedToReporting` | Exact `complianceReportSnapshot` passed to reporting |

In **shadow**, `handedToReporting` is still mostly legacy rows; `whatSystemDid.proposedOutcomes` is the new path.

## Disable

```env
ANALYSIS_DUMP_COMPLIANCE_PRE_REPORT=0
```
