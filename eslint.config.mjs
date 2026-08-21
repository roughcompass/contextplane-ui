import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // One dropdown across the product. A native <select> cannot carry the kit's
    // label, search, keyboard, and popover behaviour, so it may only appear inside
    // the primitive that implements them.
    files: ["**/*.tsx"],
    ignores: ["packages/ui/src/primitives/forms/SearchableSelect.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          message: "Use SearchableSelect from @repo/ui/primitives instead of a native <select>.",
          selector: "JSXOpeningElement[name.name='select']",
        },
      ],
    },
  },
);
