// Committed copy of what Expo writes to the gitignored expo-env.d.ts. Without
// it CI typed `process.env` as `any` while this machine typed it properly, and
// lint failed in one place for what it accepted in the other.
/// <reference types="expo/types" />
