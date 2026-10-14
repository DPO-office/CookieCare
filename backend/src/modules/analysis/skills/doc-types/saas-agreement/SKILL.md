# SaaS / subscription agreement skill

Extends `doc-types/commercial-agreement`. Deepened from the MSite SaaS Terms & SLA benchmark (99% quarterly availability, credit table, archive/exit, customer-data ownership). This is still a commercial SaaS overlay, not a privacy regime.

## clause:service_levels
Measurable availability / performance commitments (e.g. monthly or quarterly uptime %).

## clause:service_credits
Remedies / credits when the SLA is missed; exclusions documented.

## clause:uptime_commitment
Numeric uptime percentage commitment.

## clause:customer_data
Customer-owned data hosted or processed in the service.

## clause:data_archive
Post-termination archive / retrieval of customer data.

## rule:saas.availability_sla
Require a numeric availability commitment with a measurement window. Source benchmark: at least 99% measured quarterly, with planned/unscheduled maintenance exclusions (MSite cl. 2.7).

## rule:saas.service_credits
Require a credit mechanic for missed availability. Source benchmark: 1% credit per whole 1% below the SLA in the measurement period (cl. 2.8).

## rule:saas.credits_sole_remedy
Flag credits characterised as the customer's sole and exclusive remedy for SLA failure, especially beside a general liability cap (cl. 2.7).

## rule:saas.customer_data_ownership
Customer should own Customer Data; personal data should be pointed to a DPA (cl. 3.1–3.2).

## rule:saas.exit_archive
Require post-termination archive/retrieval. Source benchmark: online archive for 12 months after term, then offline retrieval for a further 12 months (cl. 2.5–2.6).

## risk:missing_sla_uptime
No measurable uptime / availability commitment identified.

## risk:missing_service_credits
No service-credit remedy when SLA is missed.

## risk:sla_credits_sole_remedy
Service credits are the customer's sole and exclusive remedy for availability failure.

## risk:missing_customer_data_ownership
The contract does not state that the customer owns Customer Data.

## risk:missing_exit_archive
No post-termination archive or retrieval path for Customer Data.
