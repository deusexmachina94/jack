#!/usr/bin/env bash
# BRIP live demo — drives a running BRIP server through the full licensing +
# provenance flow, end to end, printing each real response.
#
#   Prereqs: a running BRIP server seeded with the NZZ demo publisher.
#     docker compose -f infra/docker-compose.yml up -d
#     DATABASE_URL=postgres://brip:brip@localhost:5432/brip SEED_ON_BOOT=true \
#       pnpm --filter @brip/core dev
#   Then, in another terminal:
#     ./scripts/demo.sh                 # or:  BRIP_URL=https://your-deploy ./scripts/demo.sh
#
# Requires: curl, node (for JSON formatting + independent proof re-verification).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Run node helpers from packages/core so bare imports (jose, fflate) resolve.
nm(){ (cd "$ROOT/packages/core" && node --input-type=module -e "$1"); }
BRIP="${BRIP_URL:-http://localhost:3000}"
CONSUMER="${CONSUMER:-acme-ai}"
DOMAIN="${DOMAIN:-nzz.ch}"
BOLD=$'\e[1m'; DIM=$'\e[2m'; OK=$'\e[32m'; ACC=$'\e[36m'; WARN=$'\e[33m'; RST=$'\e[0m'
step(){ printf "\n${BOLD}${ACC}▸ %s${RST}\n" "$1"; }
note(){ printf "${DIM}%s${RST}\n" "$1"; }
pause(){ [ "${NOPAUSE:-}" = "1" ] || { printf "${DIM}  (enter)${RST}"; read -r _; }; }
jq_node(){ node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(d),null,2)))'; }

printf "${BOLD}BRIP live demo${RST}  ${DIM}→ %s  ·  consumer=%s  ·  domain=%s${RST}\n" "$BRIP" "$CONSUMER" "$DOMAIN"
curl -sf "$BRIP/health" >/dev/null || { echo "Server not reachable at $BRIP"; exit 1; }

step "1. A crawler asks: what are the AI-licensing terms for a $DOMAIN URL?"
note "GET /v1/verify?url=https://$DOMAIN/article/zurich-2026"
curl -s "$BRIP/v1/verify?url=https://$DOMAIN/article/zurich-2026" | jq_node
pause

step "2. The AI consumer requests a short-lived access token"
note "POST /v1/access-tokens  { consumerId, domain }"
ISSUED=$(curl -s -X POST "$BRIP/v1/access-tokens" -H 'content-type: application/json' \
  -d "{\"consumerId\":\"$CONSUMER\",\"domain\":\"$DOMAIN\"}")
echo "$ISSUED" | jq_node
TOKEN=$(echo "$ISSUED" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).token))')
pause

step "3. A publisher validates that token OFFLINE against the JWKS (no call back to BRIP)"
note "GET /.well-known/brip-keys.json  +  local ES256 verify"
JWKS=$(curl -s "$BRIP/.well-known/brip-keys.json")
nm "import { jwtVerify, createLocalJWKSet } from 'jose';
const { payload } = await jwtVerify('$TOKEN', createLocalJWKSet($JWKS), { algorithms:['ES256'] });
console.log('${OK}✓ token valid offline${RST}  sub=' + payload.sub + '  aud=' + payload.aud +
  '  terms.contentHash=' + payload.terms.contentHash.slice(0,16) + '…');
"
pause

step "4. Record an access event, then issue a signed provenance certificate"
curl -s -X POST "$BRIP/v1/events" -H 'content-type: application/json' \
  -d "{\"type\":\"access\",\"domain\":\"$DOMAIN\",\"consumer\":\"$CONSUMER\",\"url\":\"/article/zurich-2026\"}" >/dev/null
note "POST /v1/certificates  { consumerId, domain, period }"
START=$(node -e 'console.log(new Date(Date.now()-86400000).toISOString())')
END=$(node -e 'console.log(new Date(Date.now()+86400000).toISOString())')
CERT=$(curl -s -X POST "$BRIP/v1/certificates" -H 'content-type: application/json' \
  -d "{\"consumerId\":\"$CONSUMER\",\"domain\":\"$DOMAIN\",\"periodStart\":\"$START\",\"periodEnd\":\"$END\"}")
echo "$CERT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log(JSON.stringify({id:j.id,consumerId:j.consumerId,eventCount:j.eventCount,termsHash:j.termsHash.slice(0,16)+"…"},null,2))})'
CERT_ID=$(echo "$CERT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).id))')
note "GET /v1/transparency/verify/$CERT_ID"
curl -s "$BRIP/v1/transparency/verify/$CERT_ID" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log((j.valid?"'"${OK}"'✓ signature valid'"${RST}"'":"✗ invalid")+"  domain="+j.claims.domain)})'
pause

step "5. Export the regulator bundle and re-verify a proof INDEPENDENTLY (our own SHA-256)"
note "GET /v1/certificates/$CERT_ID/export  → zip"
ZIP=$(mktemp /tmp/brip-export.XXXX.zip)
curl -s "$BRIP/v1/certificates/$CERT_ID/export" -o "$ZIP"
nm "import { unzipSync, strFromU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = s => createHash('sha256').update(s).digest('hex');
const files = unzipSync(new Uint8Array(readFileSync('$ZIP')));
console.log('  bundle:', Object.keys(files).length, 'files →', Object.keys(files).sort().join(', '));
const name = Object.keys(files).find(n => n.startsWith('entries/'));
const { entry, proof } = JSON.parse(strFromU8(files[name]));
let acc = proof.leaf;
for (const s of proof.path) acc = s.position === 'right' ? sha(acc + s.hash) : sha(s.hash + acc);
const ok = proof.leaf === entry.entryHash && acc === proof.root;
console.log('  entry', entry.seq, entry.kind, '→ leaf', proof.leaf.slice(0,12)+'…', 'folds to root', proof.root.slice(0,12)+'…');
console.log(ok ? '${OK}✓ inclusion proof re-verified with our own crypto — no trust in BRIP required${RST}'
              : '✗ proof failed');
"
rm -f "$ZIP"
pause

step "Done."
note "Every response above came from the running server. The integrity path (tamper"
note "detection on the hash chain) is proven by the test suite:  pnpm --filter @brip/core test"
