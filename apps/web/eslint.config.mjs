import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// AT-7.2: colour comes from tokens only. A hex literal in a component or page is an error.
const HEX = "#[0-9A-Fa-f]{3}([0-9A-Fa-f]{1}|[0-9A-Fa-f]{3}|[0-9A-Fa-f]{5})?\\b";
const noHex = {
  files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      { selector: `Literal[value=/${HEX}/]`, message: "Use a token (var(--…)) instead of a hex colour." },
      { selector: `TemplateElement[value.raw=/${HEX}/]`, message: "Use a token (var(--…)) instead of a hex colour." },
    ],
  },
};

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  noHex,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "src/lib/api/schema.d.ts"],
  },
];

export default config;
