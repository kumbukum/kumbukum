#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ANDROID_DIR="${REPO_ROOT}/apps/mobile/android"
LOCAL_ANDROID_CONFIG_PATH="${STREAMIENT_ANDROID_CONFIG_PATH:-${REPO_ROOT}/../helpmonks-install-script/macos_config.fish}"

release_signing_configured() {
	[ -n "${STREAMIENT_ANDROID_KEYSTORE_PATH:-}" ] && [ -n "${STREAMIENT_ANDROID_KEYSTORE_PASSWORD:-}" ] && [ -n "${STREAMIENT_ANDROID_KEY_ALIAS:-}" ] && [ -n "${STREAMIENT_ANDROID_KEY_PASSWORD:-}" ]
}

if ! release_signing_configured && [ "${STREAMIENT_ANDROID_CONFIG_LOADED:-false}" != "true" ] && [ -f "${LOCAL_ANDROID_CONFIG_PATH}" ]; then
	if ! command -v fish >/dev/null 2>&1; then
		echo "fish is required to load Android signing config from ${LOCAL_ANDROID_CONFIG_PATH}" >&2
		exit 1
	fi
	exec fish -c '
		source "$argv[1]"
		set -q STREAMIENT_ANDROID_KEYSTORE_PATH; or set -gx STREAMIENT_ANDROID_KEYSTORE_PATH "$HELPMONKS_ANDROID_KEYSTORE_PATH"
		set -q STREAMIENT_ANDROID_KEYSTORE_PASSWORD; or set -gx STREAMIENT_ANDROID_KEYSTORE_PASSWORD "$HELPMONKS_ANDROID_KEYSTORE_PASSWORD"
		set -q STREAMIENT_ANDROID_KEY_ALIAS; or set -gx STREAMIENT_ANDROID_KEY_ALIAS "$HELPMONKS_ANDROID_KEY_ALIAS"
		set -q STREAMIENT_ANDROID_KEY_PASSWORD; or set -gx STREAMIENT_ANDROID_KEY_PASSWORD "$HELPMONKS_ANDROID_KEY_PASSWORD"
		set -gx STREAMIENT_ANDROID_CONFIG_LOADED true
		exec bash "$argv[2]"
	' "${LOCAL_ANDROID_CONFIG_PATH}" "${BASH_SOURCE[0]}"
fi

ANDROID_STUDIO_JDK_HOME="${ANDROID_STUDIO_JDK_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
DEFAULT_ANDROID_SDK_HOME="${HOME}/Library/Android/sdk"
ANDROID_SDK_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-${DEFAULT_ANDROID_SDK_HOME}}}"
AAB_PATH="${ANDROID_DIR}/app/build/outputs/bundle/release/app-release.aab"

if [ ! -x "${ANDROID_STUDIO_JDK_HOME}/bin/java" ]; then
	echo "Android Studio JDK not found at ${ANDROID_STUDIO_JDK_HOME}" >&2
	exit 1
fi
if [ ! -d "${ANDROID_SDK_HOME}/platforms" ] || [ ! -d "${ANDROID_SDK_HOME}/build-tools" ]; then
	echo "Android SDK not found at ${ANDROID_SDK_HOME}. Set ANDROID_HOME or ANDROID_SDK_ROOT to a valid SDK." >&2
	exit 1
fi

export JAVA_HOME="${ANDROID_STUDIO_JDK_HOME}"
export ANDROID_HOME="${ANDROID_SDK_HOME}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_HOME}"
export PATH="${JAVA_HOME}/bin:${PATH}"
export NODE_ENV=production
export VITE_ENABLE_LOCAL_SERVER=false

cd "${REPO_ROOT}"
pnpm --dir apps/mobile build
pnpm --dir apps/mobile exec cap sync android

cd "${ANDROID_DIR}"
./gradlew :app:bundleRelease

VERIFY_OUTPUT="$(jarsigner -verify -verbose -certs "${AAB_PATH}" 2>&1 || true)"
if echo "${VERIFY_OUTPUT}" | grep -qi "jar is unsigned"; then
	echo "${VERIFY_OUTPUT}" >&2
	echo "Release bundle is unsigned: ${AAB_PATH}" >&2
	exit 1
fi
if ! echo "${VERIFY_OUTPUT}" | grep -qi "jar verified"; then
	echo "${VERIFY_OUTPUT}" >&2
	echo "Could not verify release bundle signature: ${AAB_PATH}" >&2
	exit 1
fi

echo "Signed Android App Bundle: ${AAB_PATH}"
