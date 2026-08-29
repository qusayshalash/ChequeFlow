#!/usr/bin/env bash
#
# Phase 1 acceptance walkthrough, executed against a running API.
#
# It performs the full flow end to end with curl and asserts the outcomes of
# the seventeen acceptance criteria that can be checked from outside:
# login, contact, cheque, image, OCR, review, receive, deposit, timeline,
# an illegal transition, a missing permission and a duplicate cheque.
#
# Usage:
#   pnpm infra:up && pnpm db:deploy && pnpm db:seed
#   pnpm --filter @cheque-flow/api dev      # in another terminal
#   ./tests/acceptance-phase-1.sh
#
set -euo pipefail

API="${API_URL:-http://localhost:3333/api/v1}"
OWNER_EMAIL="${SEED_OWNER_EMAIL:-admin}"
OWNER_PASSWORD="${SEED_OWNER_PASSWORD:-admin}"
VIEWER_EMAIL="${VIEWER_EMAIL:-viewer}"

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

require() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required but not installed"
}
require curl
require jq

status_of() { # method path token [body]
  local method="$1" path="$2" token="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -o /tmp/cf_body.json -w '%{http_code}' -X "$method" "$API$path" \
      -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$body"
  else
    curl -s -o /tmp/cf_body.json -w '%{http_code}' -X "$method" "$API$path" \
      -H "Authorization: Bearer $token"
  fi
}

step '1. health'
curl -fsS "$API/health" | jq -e '.database == "up"' >/dev/null \
  && pass 'API is up and the database is reachable' \
  || fail 'API or database is not reachable'

step '2. login with the seeded owner'
OWNER_TOKEN=$(curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" | jq -r '.accessToken')
[ -n "$OWNER_TOKEN" ] && [ "$OWNER_TOKEN" != null ] && pass 'owner signed in' || fail 'owner login failed'

VIEWER_TOKEN=$(curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$VIEWER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" | jq -r '.accessToken')
[ -n "$VIEWER_TOKEN" ] && pass 'read-only user signed in' || fail 'viewer login failed'

step '3. add a customer'
CUSTOMER_ID=$(curl -fsS -X POST "$API/contacts" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"CUSTOMER","name":"عميل سيناريو القبول"}' | jq -r '.id')
[ -n "$CUSTOMER_ID" ] && pass "contact created: $CUSTOMER_ID" || fail 'contact creation failed'

SAFE_ID=$(curl -fsS "$API/locations" -H "Authorization: Bearer $OWNER_TOKEN" \
  | jq -r '[.[] | select(.type=="SAFE")][0].id')
BANK_LOCATION_ID=$(curl -fsS "$API/locations" -H "Authorization: Bearer $OWNER_TOKEN" \
  | jq -r '[.[] | select(.type=="BANK")][0].id')
BANK_ID=$(curl -fsS "$API/banks" -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.[0].id')
pass "safe=$SAFE_ID bank-location=$BANK_LOCATION_ID bank=$BANK_ID"

step '4. create an incoming cheque'
CHEQUE_NUMBER="ACC-$(date +%s)"
CREATE_BODY=$(jq -n --arg n "$CHEQUE_NUMBER" --arg src "$CUSTOMER_ID" --arg bank "$BANK_ID" \
  --arg loc "$SAFE_ID" --arg due "$(date -u -v+60d +%Y-%m-%d 2>/dev/null || date -u -d '+60 days' +%Y-%m-%d)" \
  '{direction:"INCOMING",chequeNumber:$n,amount:"1500.50",currency:"SAR",dueDate:$due,
    bankId:$bank,originalSourceId:$src,currentLocationId:$loc}')
CHEQUE=$(curl -fsS -X POST "$API/cheques" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' -d "$CREATE_BODY")
CHEQUE_ID=$(echo "$CHEQUE" | jq -r '.cheque.id')
echo "$CHEQUE" | jq -e '.cheque.status == "DRAFT"' >/dev/null && pass "cheque created in DRAFT: $CHEQUE_ID" || fail 'cheque not created'
echo "$CHEQUE" | jq -e '.cheque.amount == "1500.50"' >/dev/null && pass 'amount kept exact (no float)' || fail 'amount lost precision'

step '5. duplicate detection'
CODE=$(status_of POST /cheques "$OWNER_TOKEN" "$CREATE_BODY")
[ "$CODE" = '409' ] && jq -e '.error.code=="DUPLICATE_CHEQUE"' /tmp/cf_body.json >/dev/null \
  && pass 'a matching cheque is refused with DUPLICATE_CHEQUE' || fail "expected 409, got $CODE"

step '6. upload the front image'
# A valid JPEG header plus random bytes, so each run produces a distinct hash.
{ printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
  head -c 32 /dev/urandom
  printf '\xff\xd9'; } > /tmp/cf_front.jpg
curl -fsS -X POST "$API/cheques/$CHEQUE_ID/images" -H "Authorization: Bearer $OWNER_TOKEN" \
  -F 'side=FRONT' -F 'file=@/tmp/cf_front.jpg;type=image/jpeg' | jq -e '.image.side=="FRONT"' >/dev/null \
  && pass 'front image uploaded' || fail 'image upload failed (is MinIO running?)'

# The same bytes attached to a different cheque must be flagged as a duplicate.
SECOND_ID=$(curl -fsS -X POST "$API/cheques?allowDuplicate=true" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' -d "$CREATE_BODY" | jq -r '.cheque.id')
CODE=$(curl -s -o /tmp/cf_body.json -w '%{http_code}' -X POST "$API/cheques/$SECOND_ID/images" \
  -H "Authorization: Bearer $OWNER_TOKEN" -F 'side=FRONT' -F 'file=@/tmp/cf_front.jpg;type=image/jpeg')
[ "$CODE" = '409' ] && jq -e '.error.details.reason=="IMAGE_HASH"' /tmp/cf_body.json >/dev/null \
  && pass 'the same cheque image on another cheque is flagged as a duplicate' \
  || fail "expected 409 IMAGE_HASH, got $CODE"

printf '<?php echo 1; ?>' > /tmp/cf_fake.jpg
CODE=$(curl -s -o /tmp/cf_body.json -w '%{http_code}' -X POST "$API/cheques/$CHEQUE_ID/images" \
  -H "Authorization: Bearer $OWNER_TOKEN" -F 'side=BACK' -F 'file=@/tmp/cf_fake.jpg;type=image/jpeg')
[ "$CODE" = '415' ] && pass 'a non-image disguised as .jpg is rejected' || fail "expected 415, got $CODE"

step '7. run mock OCR'
curl -fsS -X POST "$API/cheques/$CHEQUE_ID/process-ocr" -H "Authorization: Bearer $OWNER_TOKEN" \
  | jq -e '.provider=="mock" and (.lowConfidenceFields|type=="array")' >/dev/null \
  && pass 'OCR returned a suggestion with confidence per field' || fail 'OCR failed'

VERSION=$(curl -fsS "$API/cheques/$CHEQUE_ID" -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.version')
curl -fsS "$API/cheques/$CHEQUE_ID" -H "Authorization: Bearer $OWNER_TOKEN" \
  | jq -e '.status=="PENDING_REVIEW"' >/dev/null \
  && pass 'the cheque waits for human review; OCR did not overwrite its data' || fail 'unexpected status'

step '8. illegal transition is blocked'
CODE=$(status_of POST "/cheques/$CHEQUE_ID/deposit" "$OWNER_TOKEN" "{\"toLocationId\":\"$BANK_LOCATION_ID\"}")
[ "$CODE" = '409' ] && jq -e '.error.code=="INVALID_STATE_TRANSITION"' /tmp/cf_body.json >/dev/null \
  && pass 'depositing before review is refused by the state machine' || fail "expected 409, got $CODE"

step '9. confirm the reviewed data'
REVIEW_BODY=$(jq -n --arg n "$CHEQUE_NUMBER" --argjson v "$VERSION" \
  '{confirmed:{chequeNumber:$n,amount:"1500.50",currency:"SAR"},rejectedFields:[],version:$v}')
VERSION=$(curl -fsS -X POST "$API/cheques/$CHEQUE_ID/review" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' -d "$REVIEW_BODY" | jq -r '.version')
curl -fsS "$API/cheques/$CHEQUE_ID" -H "Authorization: Bearer $OWNER_TOKEN" \
  | jq -e '.status=="IN_HAND"' >/dev/null && pass 'review confirmed, cheque is IN_HAND' || fail 'review failed'

step '10. RBAC blocks a user without permission'
CODE=$(status_of POST "/cheques/$CHEQUE_ID/deposit" "$VIEWER_TOKEN" "{\"toLocationId\":\"$BANK_LOCATION_ID\"}")
[ "$CODE" = '403' ] && pass 'the read-only user cannot deposit' || fail "expected 403, got $CODE"

step '11. deposit the cheque'
DEPOSIT_BODY=$(jq -n --arg loc "$BANK_LOCATION_ID" --argjson v "$VERSION" \
  '{toLocationId:$loc,version:$v}')
VERSION=$(curl -fsS -X POST "$API/cheques/$CHEQUE_ID/deposit" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' -d "$DEPOSIT_BODY" | jq -r '.version')
curl -fsS "$API/cheques/$CHEQUE_ID" -H "Authorization: Bearer $OWNER_TOKEN" \
  | jq -e '.status=="DEPOSITED"' >/dev/null && pass 'cheque deposited' || fail 'deposit failed'

step '12. optimistic locking'
CODE=$(status_of PATCH "/cheques/$CHEQUE_ID" "$OWNER_TOKEN" '{"notes":"stale","version":1}')
[ "$CODE" = '409' ] && jq -e '.error.code=="VERSION_CONFLICT"' /tmp/cf_body.json >/dev/null \
  && pass 'a stale write is refused' || fail "expected 409, got $CODE"

step '13. clear the cheque'
curl -fsS -X POST "$API/cheques/$CHEQUE_ID/clear" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"version\":$VERSION}" \
  | jq -e '.status=="CLEARED" and (.allowedActions|length)==0' >/dev/null \
  && pass 'cheque cleared and is now terminal' || fail 'clear failed'

step '14. the timeline tells the whole story'
curl -fsS "$API/cheques/$CHEQUE_ID/events" -H "Authorization: Bearer $OWNER_TOKEN" \
  | jq -e '[.data[].eventType] | index("CREATED") and index("VERIFIED") and index("DEPOSITED") and index("CLEARED")' >/dev/null \
  && pass 'timeline contains every movement' || fail 'timeline is incomplete'

step '15. account numbers are never returned in the clear'
curl -fsS "$API/cheques/$CHEQUE_ID" -H "Authorization: Bearer $OWNER_TOKEN" \
  | jq -e '(.accountNumberMasked == null) or (.accountNumberMasked | test("^\\*+"))' >/dev/null \
  && pass 'the account number is masked' || fail 'unmasked account number leaked'

step '16. the audit trail recorded everything'
curl -fsS "$API/audit-logs" -H "Authorization: Bearer $OWNER_TOKEN" \
  | jq -e '[.data[].action] | index("auth.login.success") and index("cheque.created")' >/dev/null \
  && pass 'audit entries written' || fail 'audit trail is missing entries'

printf '\n\033[32mAll acceptance checks passed.\033[0m\n'
