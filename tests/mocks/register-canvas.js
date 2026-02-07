// Register canvas mock for tests that require canvas (e.g., chart components)
// This file is loaded via NODE_OPTIONS=--require before vitest runs
try {
  require('canvas');
} catch (e) {
  // Canvas is optional - if it fails to load, provide a no-op mock
}
