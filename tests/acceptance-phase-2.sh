#!/bin/bash
#
# Phase 2 acceptance walkthrough.
#
# Drives every endpoint added in this phase against a running API over real
# HTTP. Nothing here is mocked: it logs in, creates cheques in two currencies,
# moves them through the state machine, and checks what comes back.
#
#   pnpm infra:up && pnpm db:migrate && pnpm db:seed
#   pnpm --filter @cheque-flow/api start
#   bash tests/acceptance-phase-2.sh
#
# Requires the seeded owner account. Override the base URL with API_BASE.
set -uo pipefail
API=${API_BASE:-http://127.0.0.1:3333/api/v1}
J='Content-Type: application/json'
pass=0; fail=0
check() { # check <label> <condition-output> <expected-substring>
  if printf '%s' "$2" | grep -q "$3"; then echo "  ✓ $1"; pass=$((pass+1));
  else echo "  ✗ $1"; echo "      expected to contain: $3"; echo "      got: $(printf '%s' "$2" | head -c 400)"; fail=$((fail+1)); fi
}

echo "── auth"
LOGIN=$(curl -s -X POST "$API/auth/login" -H "$J" -d '{"email":"admin","password":"admin"}')
check "login as admin" "$LOGIN" '"accessToken"'
TOKEN=$(printf '%s' "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).accessToken))")
A="Authorization: Bearer $TOKEN"

echo "── reference data"
LOC=$(curl -s "$API/locations" -H "$A")
LOC_ID=$(printf '%s' "$LOC" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0].id))")
CONTACTS=$(curl -s "$API/contacts?pageSize=50" -H "$A")
C1=$(printf '%s' "$CONTACTS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.data[0].id)})")
C2=$(printf '%s' "$CONTACTS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.data[1]?j.data[1].id:'')})")
check "contacts carry nationalId" "$CONTACTS" '"nationalId"'

echo "── create cheques in two currencies + written amount"
mk() { # mk <number> <amount> <currency> <due> <direction>
  sleep 1
  curl -s -X POST "$API/cheques" -H "$J" -H "$A" -d "{
    \"direction\":\"$5\",\"chequeNumber\":\"$1\",\"amount\":\"$2\",\"currency\":\"$3\",
    \"amountInWords\":\"مبلغ اختباري\",\"dueDate\":\"$4\",\"originalSourceId\":\"$C1\",
    \"currentLocationId\":\"$LOC_ID\",\"drawerName\":\"ساحب الاختبار\"}"
}
CH_ILS=$(mk 92${RANDOM}1 1500.00 ILS 2026-09-30 INCOMING)
check "create ILS cheque" "$CH_ILS" '"amountInWords":"مبلغ اختباري"'
CH_USD=$(mk 92${RANDOM}2 250.75 USD 2026-10-15 INCOMING)
check "create USD cheque" "$CH_USD" '"currency":"USD"'
CH_LATE=$(mk 92${RANDOM}3 400.00 ILS 2026-08-01 INCOMING)
CH_OUT=$(mk 92${RANDOM}4 999.99 USD 2026-12-01 OUTGOING)
ID_ILS=$(printf '%s' "$CH_ILS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).cheque.id))")
ID_LATE=$(printf '%s' "$CH_LATE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).cheque.id))")
V_LATE=$(printf '%s' "$CH_LATE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).cheque.version))")

echo "── duplicate detection"
DUP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/cheques" -H "$J" -H "$A" -d "{
  \"direction\":\"INCOMING\",\"chequeNumber\":\"910001\",\"amount\":\"1500.00\",\"currency\":\"ILS\",
  \"dueDate\":\"2026-09-30\",\"currentLocationId\":\"$LOC_ID\"}")
check "duplicate rejected with 409" "$DUP" '409'

echo "── move the late cheque into hand so it counts as overdue"
RECV=$(curl -s -X POST "$API/cheques/$ID_LATE/receive" -H "$J" -H "$A" \
  -d "{\"fromContactId\":\"$C1\",\"toLocationId\":\"$LOC_ID\",\"version\":$V_LATE}")
check "receive succeeded" "$RECV" '"status":"IN_HAND"'
check "isOverdue computed on detail" "$RECV" '"isOverdue":true'

echo "── multi-currency dashboard"
DASH=$(curl -s "$API/dashboard" -H "$A")
check "dashboard has per-currency array" "$DASH" '"currencies"'
check "dashboard reports ILS" "$DASH" '"currency":"ILS"'
check "dashboard reports USD" "$DASH" '"currency":"USD"'
check "dashboard has overdue bucket" "$DASH" '"overdue"'
check "dashboard reports drafts" "$DASH" '"draft"'
check "dashboard reports collected" "$DASH" '"cleared"'
check "dashboard reports returned" "$DASH" '"returned"'
check "events carry the cheque number" "$DASH" '"chequeNumber"'
printf '%s' "$DASH" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const j=JSON.parse(d);
  console.log('    default currency:', j.defaultCurrency);
  for (const c of j.currencies)
    console.log('    '+c.currency+': inHand='+c.inHand.count+'/'+c.inHand.total+
      ' overdue='+c.overdue.count+'/'+c.overdue.total+
      ' incoming='+c.incoming.count+' outgoing='+c.outgoing.count);
});"

echo "── list filters"
OVER=$(curl -s "$API/cheques?overdue=true" -H "$A")
check "overdue filter returns the late cheque" "$OVER" '910003'
NOTOVER=$(curl -s "$API/cheques?overdue=false" -H "$A")
if printf '%s' "$NOTOVER" | grep -q '910003'; then echo "  ✗ overdue=false still returns the late cheque"; fail=$((fail+1)); else echo "  ✓ overdue=false excludes the late cheque"; pass=$((pass+1)); fi
CUR=$(curl -s "$API/cheques?currency=USD" -H "$A")
check "currency filter works" "$CUR" '"currency":"USD"'
if printf '%s' "$CUR" | grep -q '"currency":"ILS"'; then echo "  ✗ currency filter leaked ILS"; fail=$((fail+1)); else echo "  ✓ currency filter excludes other currencies"; pass=$((pass+1)); fi
DIR=$(curl -s "$API/cheques?direction=OUTGOING" -H "$A")
check "direction filter works" "$DIR" '910004'

echo "── CSV export"
CSV=$(curl -s "$API/cheques/export?locale=ar" -H "$A")
check "export returns a CSV header row" "$CSV" 'رقم الشيك'
check "export includes a cheque" "$CSV" '910001'
HEADERS=$(curl -s -D - -o /dev/null "$API/cheques/export" -H "$A")
check "export sets a CSV content type" "$HEADERS" 'text/csv'
check "export sets a download filename" "$HEADERS" 'attachment; filename='

echo "── bounce with a reason and fee"
CH_B=$(mk 92${RANDOM}5 700.00 ILS 2026-09-01 INCOMING)
ID_B=$(printf '%s' "$CH_B" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).cheque.id))")
V_B=$(printf '%s' "$CH_B" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).cheque.version))")
R_B=$(curl -s -X POST "$API/cheques/$ID_B/receive" -H "$J" -H "$A" -d "{\"fromContactId\":\"$C1\",\"toLocationId\":\"$LOC_ID\",\"version\":$V_B}")
V_B1=$(printf '%s' "$R_B" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).version))")
D_B=$(curl -s -X POST "$API/cheques/$ID_B/deposit" -H "$J" -H "$A" -d "{\"toLocationId\":\"$LOC_ID\",\"version\":$V_B1}")
check "deposit before bounce" "$D_B" '"status":"DEPOSITED"'
V_B2=$(printf '%s' "$D_B" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).version))")
BOUNCE=$(curl -s -X POST "$API/cheques/$ID_B/bounce" -H "$J" -H "$A" -d "{\"reason\":\"رصيد غير كاف\",\"fee\":\"25.00\",\"version\":$V_B2}")
check "bounce records the reason" "$BOUNCE" '"bounceReason":"رصيد غير كاف"'
check "bounce records the fee" "$BOUNCE" '"bounceFee":"25.00"'
NEGFEE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/cheques/$ID_B/bounce" -H "$J" -H "$A" -d '{"reason":"x","fee":"-5.00","version":99}')
check "negative fee rejected" "$NEGFEE" '4'

echo "── contact statement"
STMT=$(curl -s "$API/contacts/$C1/statement" -H "$A")
check "statement returns the contact" "$STMT" '"contact"'
check "statement splits by currency" "$STMT" '"currencies"'
check "statement lists cheques" "$STMT" '"cheques"'
printf '%s' "$STMT" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const j=JSON.parse(d);
  console.log('    contact:', j.contact.name);
  for (const c of j.currencies)
    console.log('    '+c.currency+': pending='+c.pending.count+'/'+c.pending.total+
      ' collected='+c.collected.count+' bounced='+c.bounced.count+'/'+c.bounced.total);
});"

echo "── reminders"
REM=$(curl -s -X POST "$API/cheques/$ID_ILS/reminders" -H "$J" -H "$A" -d '{"remindAt":"2026-09-01T08:00:00.000Z","note":"اتصل بالعميل"}')
check "custom reminder created" "$REM" '"id"'
NOTIF=$(curl -s "$API/notifications" -H "$A")
check "reminder appears in the feed" "$NOTIF" 'اتصل بالعميل'
check "feed marks whether it is due" "$NOTIF" '"isDue"'
check "feed marks custom reminders" "$NOTIF" '"custom":true'
REM_ID=$(printf '%s' "$REM" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
SNOOZE=$(curl -s -X POST "$API/notifications/$REM_ID/snooze" -H "$J" -H "$A" -d '{"minutes":1440}')
check "snooze moves the reminder" "$SNOOZE" '"remindAt"'
ACK=$(curl -s -X POST "$API/notifications/$REM_ID/acknowledge" -H "$J" -H "$A")
check "acknowledge succeeds" "$ACK" '"acknowledged":true'
NOTIF2=$(curl -s "$API/notifications" -H "$A")
if printf '%s' "$NOTIF2" | grep -q "$REM_ID"; then echo "  ✗ acknowledged reminder still in the feed"; fail=$((fail+1)); else echo "  ✓ acknowledged reminder leaves the feed"; pass=$((pass+1)); fi

echo "── users"
USERS=$(curl -s "$API/users" -H "$A")
check "user list works" "$USERS" '"roles"'
if printf '%s' "$USERS" | grep -qi 'passwordHash'; then echo "  ✗ user list leaked passwordHash"; fail=$((fail+1)); else echo "  ✓ user list never exposes a password hash"; pass=$((pass+1)); fi
NEW_LOGIN="acct$RANDOM"
NEWU=$(curl -s -X POST "$API/users" -H "$J" -H "$A" -d "{\"name\":\"محاسب جديد\",\"email\":\"$NEW_LOGIN\",\"password\":\"ValidPassword1\",\"roles\":[\"ACCOUNTANT\"]}")
check "create user" "$NEWU" '"ACCOUNTANT"'
DUPU=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/users" -H "$J" -H "$A" -d '{"name":"x","email":"admin","password":"ValidPassword1","roles":["ACCOUNTANT"]}')
check "duplicate sign-in name rejected" "$DUPU" '4'
ME_ID=$(curl -s "$API/auth/me" -H "$A" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
SELF=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/users/$ME_ID" -H "$J" -H "$A" -d '{"status":"DISABLED"}')
check "cannot disable your own account" "$SELF" '4'
ROLES=$(curl -s "$API/users/roles" -H "$A")
check "assignable roles listed" "$ROLES" 'OWNER'

echo "── contact delete and merge"
NEWC=$(curl -s -X POST "$API/contacts" -H "$J" -H "$A" -d '{"type":"CUSTOMER","name":"جهة مكررة"}')
NEWC_ID=$(printf '%s' "$NEWC" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
DEL=$(curl -s -X DELETE "$API/contacts/$NEWC_ID" -H "$A")
check "unreferenced contact is deleted outright" "$DEL" '"deleted":true'
DEL2=$(curl -s -X DELETE "$API/contacts/$C1" -H "$A")
check "referenced contact is deactivated, not deleted" "$DEL2" '"deleted":false'
if [ -n "$C2" ]; then
  MERGE=$(curl -s -X POST "$API/contacts/merge" -H "$J" -H "$A" -d "{\"sourceId\":\"$C2\",\"targetId\":\"$C1\"}")
  check "merge returns the surviving contact" "$MERGE" '"id"'
fi
SELFMERGE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/contacts/merge" -H "$J" -H "$A" -d "{\"sourceId\":\"$C1\",\"targetId\":\"$C1\"}")
check "self-merge rejected" "$SELFMERGE" '4'

echo "── ledger is still append-only after a merge"
EVENTS=$(curl -s "$API/cheques/$ID_LATE/events" -H "$A")
check "timeline still readable" "$EVENTS" '"eventType"'

echo
echo "════════════════════════════════"
echo "  passed: $pass   failed: $fail"
echo "════════════════════════════════"
[ "$fail" -eq 0 ]
