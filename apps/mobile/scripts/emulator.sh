#!/usr/bin/env bash
# Light emulator launch for this laptop (i7-6820HQ, Intel HD 530 + NVIDIA Quadro M1000M 2 GB, Pop!_OS, Wayland).
#   bash apps/mobile/scripts/emulator.sh                 # NexusID_Lite on the NVIDIA GPU (default)
#   GPU=intel bash apps/mobile/scripts/emulator.sh       # fall back to the Intel iGPU
#   AVD=Medium_Phone bash apps/mobile/scripts/emulator.sh  # the old, heavy Android 17 AVD
#
# NexusID_Lite: Android 14 (API 34) Google APIs x86_64, 2 cores, 2 GB RAM, 720x1280, no frame, no audio.
# - KVM acceleration.
# - Renders on the NVIDIA card through PRIME render offload instead of the Intel iGPU.
# - NO snapshots (-no-snapshot): Quick Boot maps the guest's 2 GB RAM onto snapshots/default_boot/ram.img
#   and flushes it constantly — measured 560 MB/s of writes and ~30 % iowait, which froze the laptop.
#   Every start is a cold boot instead (about a minute).
# - Runs at lower CPU priority so the desktop stays responsive.
# Tip: don't run a first-time Gradle build at the same time as a cold boot.
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
# Android Studio is a flatpak, so its AVDs live in the flatpak config dir.
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$HOME/.var/app/com.google.AndroidStudio/config/.android/avd}"
AVD="${AVD:-NexusID_Lite}"

if [ "${GPU:-nvidia}" = "nvidia" ]; then
  export __NV_PRIME_RENDER_OFFLOAD=1
  export __GLX_VENDOR_LIBRARY_NAME=nvidia
  export __VK_LAYER_NV_optimus=NVIDIA_only
  export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.json
fi

exec nice -n 5 "$ANDROID_HOME/emulator/emulator" -avd "$AVD" \
  -gpu host \
  -no-boot-anim \
  -no-audio \
  -no-snapshot \
  -netdelay none -netspeed full \
  "$@"
