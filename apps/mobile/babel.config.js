module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Must be last (react-native-reanimated 4 / worklets).
  plugins: ['react-native-worklets/plugin'],
};
