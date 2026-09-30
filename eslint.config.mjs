import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "src/app/fonts/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
