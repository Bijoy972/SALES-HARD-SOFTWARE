#!/usr/bin/env bash
# Inject a release signing config into android/app/build.gradle. Idempotent.
set -euo pipefail

GRADLE_FILE="android/app/build.gradle"

if [ ! -f "$GRADLE_FILE" ]; then
  echo "ERROR: $GRADLE_FILE not found. Did 'cap add android' run?" >&2
  exit 1
fi

if grep -q "BIJOY_SIGNING_INJECTED" "$GRADLE_FILE"; then
  echo "Signing config already injected — skipping."
  exit 0
fi

# Backup
cp "$GRADLE_FILE" "${GRADLE_FILE}.bak"

# Use python for a safe in-place transform (sed across multi-line android{} is fragile).
python3 - "$GRADLE_FILE" <<'PY'
import re, sys, pathlib
p = pathlib.Path(sys.argv[1])
src = p.read_text()

signing_block = """
    // BIJOY_SIGNING_INJECTED
    signingConfigs {
        release {
            storeFile file(System.getenv('BIJOY_KEYSTORE_PATH') ?: 'release.jks')
            storePassword System.getenv('BIJOY_KEYSTORE_PASSWORD') ?: ''
            keyAlias System.getenv('BIJOY_KEY_ALIAS') ?: ''
            keyPassword System.getenv('BIJOY_KEY_PASSWORD') ?: ''
        }
    }
"""

# Inject signingConfigs as the first child of android { ... }
src2, n = re.subn(
    r"(android\s*\{\s*\n)",
    r"\1" + signing_block + "\n",
    src,
    count=1,
)
if n == 0:
    print("Could not find 'android {' block", file=sys.stderr)
    sys.exit(2)

# Inject signingConfig into release buildType
src3, n2 = re.subn(
    r"(buildTypes\s*\{\s*\n\s*release\s*\{\s*\n)",
    r"\1            signingConfig signingConfigs.release\n",
    src2,
    count=1,
)
if n2 == 0:
    # If there's no explicit release{} block inside buildTypes, append one.
    src3, n3 = re.subn(
        r"(buildTypes\s*\{\s*\n)",
        r"\1        release {\n            signingConfig signingConfigs.release\n            minifyEnabled false\n        }\n",
        src2,
        count=1,
    )
    if n3 == 0:
        print("Could not inject signingConfig into buildTypes", file=sys.stderr)
        sys.exit(3)

p.write_text(src3)
print("Signing config injected OK.")
PY

# Export env vars used by the gradle file from CI secrets
export BIJOY_KEYSTORE_PATH="$(pwd)/android/app/release.jks"
export BIJOY_KEYSTORE_PASSWORD="${KEYSTORE_PASSWORD}"
export BIJOY_KEY_ALIAS="${KEY_ALIAS}"
export BIJOY_KEY_PASSWORD="${KEY_PASSWORD}"

# Persist for the next gradle step
{
  echo "BIJOY_KEYSTORE_PATH=$BIJOY_KEYSTORE_PATH"
  echo "BIJOY_KEYSTORE_PASSWORD=$BIJOY_KEYSTORE_PASSWORD"
  echo "BIJOY_KEY_ALIAS=$BIJOY_KEY_ALIAS"
  echo "BIJOY_KEY_PASSWORD=$BIJOY_KEY_PASSWORD"
} >> "$GITHUB_ENV"

echo "Signing config ready."
