#!/usr/bin/env bash
# Build the debug APK for the emulator (x86_64 only, see android/gradle.properties).
#   bash apps/mobile/scripts/build-apk.sh            # assembleDebug
#   bash apps/mobile/scripts/build-apk.sh install    # build + install on the running emulator
#
# Uses Android Studio's bundled JDK (flatpak) when no JAVA_HOME is set, and runs Gradle at low
# CPU and disk priority so the laptop stays usable during the first native (C++) build.
set -euo pipefail

cd "$(dirname "$0")/.."

# React Native 0.88 needs Node 22 (apps/mobile/.nvmrc); Gradle calls node for codegen and the JS bundle.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  set +u; . "$HOME/.nvm/nvm.sh"; nvm use --silent >/dev/null; set -u
fi
echo "node $(node -v)"

cd android

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [ -z "${JAVA_HOME:-}" ]; then
  export JAVA_HOME="$HOME/.local/share/flatpak/app/com.google.AndroidStudio/current/active/files/extra/jbr"
fi
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

TASK=assembleDebug
[ "${1:-}" = "install" ] && TASK=installDebug

exec nice -n 15 ionice -c3 ./gradlew "$TASK"
