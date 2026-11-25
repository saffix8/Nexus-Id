// Backend base URL. 10.0.2.2 is the host machine from the Android emulator.
// On a real phone set API_URL to the laptop's LAN IP (DEMO_BUILD.md §5).
export const API_BASE_URL = (process.env.API_URL ?? 'http://10.0.2.2:4000/api/v1').replace(/\/$/, '');
