import eslint from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["**/dist/"],
  },
  eslint.configs.recommended,
  jsdoc.configs["flat/contents-typescript"],
  jsdoc.configs["flat/logical-typescript"],
  jsdoc.configs["flat/stylistic-typescript"],
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    files: ["**/*.ts"],
    ...config,
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    files: ["**/*.ts"],
    ...config,
  })),
  {
    rules: {
      "jsdoc/check-line-alignment": "warn",
      "jsdoc/check-tag-names": ["warn", { definedTags: ["category"] }],
      "jsdoc/informative-docs": "off",
      "jsdoc/match-description": "off",
      "jsdoc/no-bad-blocks": "warn",
      "jsdoc/tag-lines": "off",
      "no-control-regex": "off",
      "prefer-const": "off",
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/class-literal-property-style": "off",
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { disallowTypeAnnotations: false },
      ],
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-duplicate-type-constituents": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": ["error", { ignoreRestArgs: true }],
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-misused-spread": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-arguments": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-useless-constructor": "off",
      "@typescript-eslint/prefer-for-of": "off",
      "@typescript-eslint/prefer-function-type": "off",
      "@typescript-eslint/prefer-return-this-type": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/unified-signatures": "off",
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
