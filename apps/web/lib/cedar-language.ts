import type { languages } from "monaco-editor";

export const CEDAR_LANGUAGE_ID = "cedar";

export const cedarLanguageConfig: languages.LanguageConfiguration = {
  comments: {
    lineComment: "//",
  },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"', notIn: ["string"] },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
  ],
};

export const cedarMonarchTokens: languages.IMonarchLanguage = {
  defaultToken: "",
  ignoreCase: false,

  keywords: ["permit", "forbid", "when", "unless"],
  operators: ["in", "has", "like", "if", "then", "else", "is"],
  builtinVariables: ["principal", "action", "resource", "context"],
  booleans: ["true", "false"],

  methods: [
    "contains",
    "containsAll",
    "containsAny",
    "isEmpty",
    "getTag",
    "hasTag",
  ],
  extensionMethods: [
    "isIpv4",
    "isIpv6",
    "isLoopback",
    "isMulticast",
    "isInRange",
    "lessThan",
    "lessThanOrEqual",
    "greaterThan",
    "greaterThanOrEqual",
    "offset",
    "durationSince",
    "toDate",
    "toTime",
    "toMilliseconds",
    "toSeconds",
    "toMinutes",
    "toHours",
    "toDays",
  ],
  extensionFunctions: ["ip", "decimal", "datetime", "duration"],

  symbols: /[=><!~?:&|+\-*\/^%]+/,

  tokenizer: {
    root: [
      // Comments
      [/\/\/.*$/, "comment"],

      // Annotations  @id("value")
      [/@[_a-zA-Z][_a-zA-Z0-9]*/, "annotation"],

      // Template slots  ?principal  ?resource
      [/\?(principal|resource)\b/, "variable"],

      // Entity UIDs: Namespace::Type::"id"
      [
        /[_a-zA-Z][_a-zA-Z0-9]*(?:::[_a-zA-Z][_a-zA-Z0-9]*)*(?=::")/,
        "type.identifier",
      ],

      // Namespaced types: Namespace::Type (without ::"string")
      [
        /[_a-zA-Z][_a-zA-Z0-9]*(?:::[_a-zA-Z][_a-zA-Z0-9]*)+/,
        "type.identifier",
      ],

      // Identifiers & keywords
      [
        /[_a-zA-Z][_a-zA-Z0-9]*/,
        {
          cases: {
            "@keywords": "keyword",
            "@operators": "keyword.operator",
            "@builtinVariables": "variable.predefined",
            "@booleans": "constant.language",
            "@extensionFunctions": "support.function",
            "@default": "identifier",
          },
        },
      ],

      // Method calls  .contains(  .isIpv4(
      [
        /\.\s*([_a-zA-Z][_a-zA-Z0-9]*)\s*(?=\()/,
        {
          cases: {
            "@methods": { token: "function" },
            "@extensionMethods": { token: "function" },
            "@default": "identifier",
          },
        },
      ],

      // Numbers
      [/\d+/, "number"],

      // Strings
      [/"/, "string", "@string"],

      // Operators & delimiters
      [/[{}()\[\]]/, "@brackets"],
      [/[;,]/, "delimiter"],
      [/::/, "delimiter"],
      [/@symbols/, "operator"],

      // Whitespace
      [/\s+/, "white"],
    ],

    string: [
      [/[^\\"]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, "string", "@pop"],
    ],
  },
};

export function registerCedarLanguage(monaco: typeof import("monaco-editor")) {
  if (
    monaco.languages
      .getLanguages()
      .some((lang) => lang.id === CEDAR_LANGUAGE_ID)
  ) {
    return;
  }

  monaco.languages.register({ id: CEDAR_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(
    CEDAR_LANGUAGE_ID,
    cedarMonarchTokens,
  );
  monaco.languages.setLanguageConfiguration(
    CEDAR_LANGUAGE_ID,
    cedarLanguageConfig,
  );
}
