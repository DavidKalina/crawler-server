module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup.ts"],
  roots: ["<rootDir>/src/", "<rootDir>/tests/"],
  moduleDirectories: ["node_modules", "src"],
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
  },
};
