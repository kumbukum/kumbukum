#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
IOS_DIR="${REPO_ROOT}/apps/mobile/ios"
PROJECT_PATH="${IOS_DIR}/App/App.xcodeproj"
BUILD_DIR="${IOS_DIR}/App/build"
VERSION="${STREAMIENT_IOS_VERSION:-1.0}"
BUILD_NUMBER="${STREAMIENT_IOS_BUILD_NUMBER:-1}"
ARCHIVE_PATH="${STREAMIENT_IOS_ARCHIVE_PATH:-${BUILD_DIR}/Streamient-${VERSION}-${BUILD_NUMBER}.xcarchive}"
EXPORT_PATH="${STREAMIENT_IOS_EXPORT_PATH:-${BUILD_DIR}/export-${BUILD_NUMBER}}"
UPLOAD="${STREAMIENT_IOS_UPLOAD:-false}"

if [ "${1:-}" = "--upload" ]; then
	UPLOAD=true
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
	echo "xcodebuild is required" >&2
	exit 1
fi
if [ -e "${ARCHIVE_PATH}" ]; then
	echo "Archive already exists: ${ARCHIVE_PATH}" >&2
	exit 1
fi
if [ -e "${EXPORT_PATH}" ]; then
	echo "Export path already exists: ${EXPORT_PATH}" >&2
	exit 1
fi

export NODE_ENV=production
export VITE_ENABLE_LOCAL_SERVER=false

cd "${REPO_ROOT}"
pnpm --dir apps/mobile build
pnpm --dir apps/mobile exec cap sync ios
mkdir -p "${BUILD_DIR}"

xcodebuild archive \
	-project "${PROJECT_PATH}" \
	-scheme App \
	-configuration Release \
	-destination "generic/platform=iOS" \
	-archivePath "${ARCHIVE_PATH}" \
	MARKETING_VERSION="${VERSION}" \
	CURRENT_PROJECT_VERSION="${BUILD_NUMBER}"

xcodebuild -exportArchive \
	-archivePath "${ARCHIVE_PATH}" \
	-exportPath "${EXPORT_PATH}" \
	-exportOptionsPlist "${IOS_DIR}/ExportOptions.plist"

if [ "${UPLOAD}" = "true" ]; then
	xcodebuild -exportArchive \
		-archivePath "${ARCHIVE_PATH}" \
		-exportPath "${BUILD_DIR}/upload-${BUILD_NUMBER}" \
		-exportOptionsPlist "${IOS_DIR}/UploadOptions.plist" \
		-allowProvisioningUpdates
fi

echo "Signed iOS archive: ${ARCHIVE_PATH}"
echo "Signed iOS app: ${EXPORT_PATH}/App.ipa"
