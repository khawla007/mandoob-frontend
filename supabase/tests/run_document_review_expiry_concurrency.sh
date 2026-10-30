#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
acceptance_markers='REVIEW_VS_REVIEW_ONE_WINNER SUPERSEDED_HEAD_CONFLICT EXPIRY_VS_EXPIRY_ONE_WINNER CONFLICT_AUDIT_ATOMIC DOCUMENT_REVIEW_EXPIRY_CONCURRENCY_PASS'
readonly acceptance_markers

# The Node runner owns two independent psql sessions for each held transaction.
# Its fixed, redacted acceptance markers are:
# REVIEW_VS_REVIEW_ONE_WINNER
# SUPERSEDED_HEAD_CONFLICT
# EXPIRY_VS_EXPIRY_ONE_WINNER
# CONFLICT_AUDIT_ATOMIC
# DOCUMENT_REVIEW_EXPIRY_CONCURRENCY_PASS
node "${test_dir}/document_review_expiry_concurrency.mjs"
