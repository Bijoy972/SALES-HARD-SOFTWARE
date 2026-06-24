#!/usr/bin/env bash
# Deploy BIJOY PRODUCTION to GitHub.
# Prereqs (run once before this script):
#   pkg install -y gh
#   gh auth login        # pick GitHub.com → HTTPS → login with web browser
#
# Run from inside the project dir:
#   bash scripts/deploy-from-termux.sh

set -euo pipefail

cd "$(dirname "$0")/.."

OWNER="Bijoy972"
REPO="SALES-HARD-SOFTWARE"
FULL_REPO="${OWNER}/${REPO}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh is not installed. Run:  pkg install -y gh" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run:  gh auth login" >&2
  exit 1
fi

# Sanity: keystore + creds present
if [ ! -f release.jks ] || [ ! -f keystore.b64 ] || [ ! -f release-keystore-info.txt ]; then
  echo "ERROR: release.jks / keystore.b64 / release-keystore-info.txt missing." >&2
  echo "       (Run the project's keystore-gen step first.)" >&2
  exit 1
fi

# Pull passwords out of release-keystore-info.txt
KEYSTORE_PASSWORD=$(grep '^KEYSTORE_PASSWORD=' release-keystore-info.txt | cut -d= -f2-)
KEY_ALIAS=$(grep '^KEY_ALIAS=' release-keystore-info.txt | cut -d= -f2-)
KEY_PASSWORD=$(grep '^KEY_PASSWORD=' release-keystore-info.txt | cut -d= -f2-)
if [ -z "$KEYSTORE_PASSWORD" ] || [ -z "$KEY_ALIAS" ] || [ -z "$KEY_PASSWORD" ]; then
  echo "ERROR: could not parse release-keystore-info.txt" >&2
  exit 1
fi

# Create the repo if missing (no-op if it already exists)
if ! gh repo view "$FULL_REPO" >/dev/null 2>&1; then
  echo "==> Creating repo $FULL_REPO (public, no auto-push)..."
  gh repo create "$FULL_REPO" --public --source=. --remote=origin --push=false || true
else
  echo "==> Repo $FULL_REPO already exists; making sure origin remote is set..."
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/${FULL_REPO}.git"
  fi
fi

# Set the 4 secrets
echo "==> Uploading secrets to ${FULL_REPO}..."
gh secret set ANDROID_KEYSTORE_BASE64 --repo "$FULL_REPO" < keystore.b64
gh secret set KEYSTORE_PASSWORD --repo "$FULL_REPO" --body "$KEYSTORE_PASSWORD"
gh secret set KEY_ALIAS --repo "$FULL_REPO" --body "$KEY_ALIAS"
gh secret set KEY_PASSWORD --repo "$FULL_REPO" --body "$KEY_PASSWORD"
echo "==> Secrets uploaded."

# Push
echo "==> Pushing main to origin..."
git branch -M main
git push -u origin main

echo
echo "==> Push complete."
echo "==> Watch the build:"
echo "    gh run watch --repo $FULL_REPO"
echo "==> APK will appear at:"
echo "    https://github.com/${FULL_REPO}/releases/latest"
