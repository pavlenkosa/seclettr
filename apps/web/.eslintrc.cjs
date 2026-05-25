module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: ["./tsconfig.json", "./tsconfig.test.json"],
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["@typescript-eslint", "react-hooks", "jsx-a11y"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_",
      },
    ],
    // type-aware rules (require project in parserOptions)
    "@typescript-eslint/no-floating-promises": ["warn", { ignoreIIFE: true }],
    "@typescript-eslint/no-misused-promises": ["warn"],
    "@typescript-eslint/consistent-type-imports": [
      "warn",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-argument": "warn",
    "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unsafe-return": "warn",
    "@typescript-eslint/no-unsafe-call": "warn",
    "@typescript-eslint/no-unnecessary-type-assertion": "warn",
    "@typescript-eslint/require-await": "warn",
    "@typescript-eslint/await-thenable": "warn",
    "@typescript-eslint/no-this-alias": "warn",
    "@typescript-eslint/no-redundant-type-constituents": "warn",
    "@typescript-eslint/no-misused-promises": "warn",
    "@typescript-eslint/unbound-method": "warn",
    // Test overrides: vitest/vite patterns commonly need async mocks and
    // unbound method references without causing real bugs.
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    // a11y: interactive semantics
    "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
    "jsx-a11y/interactive-supports-focus": "error",
    "jsx-a11y/click-events-have-key-events": "error",
    "jsx-a11y/no-static-element-interactions": "error",
    "jsx-a11y/aria-role": "error",
    "jsx-a11y/role-has-required-aria-props": "error",
    "jsx-a11y/aria-props": "error",
  },
  overrides: [
    {
      files: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "@typescript-eslint/require-await": "off",
        "@typescript-eslint/unbound-method": "off",
        "@typescript-eslint/no-unnecessary-type-assertion": "warn",
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "no-empty": "off",
        "prefer-const": "off",
        "no-control-regex": "off",
        "no-mixed-spaces-and-tabs": "off",
      },
    },
  ],
};
