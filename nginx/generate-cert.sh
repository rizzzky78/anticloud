#!/usr/bin/env bash
# =============================================================================
# generate-cert.sh — create a self-signed TLS certificate for anticloud
#
# Intended for INTRANET use. Because the server IP may be dynamic, the cert is
# generated with a generic CN plus optional Subject Alternative Names (SANs)
# so you can pin the current IP/hostname if you want fewer browser warnings.
#
# Usage:
#   ./nginx/generate-cert.sh                       # generic cert, 825 days
#   ./nginx/generate-cert.sh 10.54.204.10          # + IP SAN
#   ./nginx/generate-cert.sh 10.54.204.10 anticloud.local
#
# Output:
#   nginx/certs/anticloud.crt
#   nginx/certs/anticloud.key
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/certs"
DAYS=825

mkdir -p "${CERT_DIR}"

# Build the SAN list from CLI args (IPs and/or DNS names).
SAN="DNS:localhost,IP:127.0.0.1"
for arg in "$@"; do
  if [[ "${arg}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    SAN="${SAN},IP:${arg}"
  else
    SAN="${SAN},DNS:${arg}"
  fi
done

echo "[cert] Generating self-signed certificate"
echo "[cert]   dir : ${CERT_DIR}"
echo "[cert]   days: ${DAYS}"
echo "[cert]   SAN : ${SAN}"

# Use a temporary OpenSSL config instead of -subj/-addext. On Git-Bash / MSYS
# (Windows), values like "/C=ID/..." get mangled into Windows paths; putting
# subject + SAN in a config file sidesteps that entirely (and works on Linux).
TMP_CNF="$(mktemp)"
trap 'rm -f "${TMP_CNF}"' EXIT

cat > "${TMP_CNF}" <<EOF
[req]
distinguished_name = dn
x509_extensions    = v3_req
prompt             = no

[dn]
C  = ID
O  = OM70
CN = anticloud-production

[v3_req]
subjectAltName = ${SAN}
EOF

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "${CERT_DIR}/anticloud.key" \
  -out "${CERT_DIR}/anticloud.crt" \
  -days "${DAYS}" \
  -config "${TMP_CNF}"

chmod 600 "${CERT_DIR}/anticloud.key"
chmod 644 "${CERT_DIR}/anticloud.crt"

echo "[cert] Done:"
echo "[cert]   ${CERT_DIR}/anticloud.crt"
echo "[cert]   ${CERT_DIR}/anticloud.key"