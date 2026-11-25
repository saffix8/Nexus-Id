#!/usr/bin/env bash
# Fast emulator launch for this laptop (i7-6820HQ, Intel HD 530 + NVIDIA Quadro M1000M, Pop!_OS).
#   bash apps/mobile/scripts/emulator.sh            # NVIDIA GPU (default)
#   GPU=intel bash apps/mobile/scripts/emulator.sh  # fall back to the Intel iGPU
#
# - KVM acceleration (already working).
# - Renders on the NVIDIA card through PRIME render offload instead of the Intel iGPU.
# - Quick Boot snapshots: first start is a cold boot, later starts take a few seconds.
# Tip: don't run a first-time Gradle build at the same time — it maxes all 8 threads.
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
# Android Studio is a flatpak, so its AVDs live in the flatpak config dir.
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$HOME/.var/app/com.google.AndroidStudio/config/.android/avd}"
AVD="${AVD:-Medium_Phone}"

if [ "${GPU:-nvidia}" = "nvidia" ]; then
  export __NV_PRIME_RENDER_OFFLOAD=1
  export __GLX_VENDOR_LIBRARY_NAME=nvidia
  export __VK_LAYER_NV_optimus=NVIDIA_only
  export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.json
fi

exec "$ANDROID_HOME/emulator/emulator" -avd "$AVD" \
  -gpu host \
  -no-boot-anim \
  -no-audio \
  -camera-back webcam0 \
  "$@"
