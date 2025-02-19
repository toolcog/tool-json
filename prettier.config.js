export default {
  arrowParens: "always",
  bracketSpacing: true,
  printWidth: 80,
  quoteProps: "as-needed",
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  experimentalTernaries: true,
  overrides: [
    {
      files: ["*.md"],
      options: {
        trailingComma: "none",
      },
    },
  ],
};
