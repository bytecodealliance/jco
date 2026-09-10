export interface ParseArgsOption {
  type: "string" | "boolean";
  multiple?: boolean;
  short?: string;
  default?: string | boolean | string[] | boolean[];
}

export interface ParseArgsConfig {
  args?: string[];
  strict?: boolean;
  allowPositionals?: boolean;
  allowNegative?: boolean;
  tokens?: boolean;
  options?: Record<string, ParseArgsOption>;
}

export interface OptionToken {
  kind: "option";
  name: string;
  rawName: string;
  index: number;
  value: string | undefined;
  inlineValue: boolean | undefined;
}

export type ParseArgsToken =
  | OptionToken
  | { kind: "positional"; index: number; value: string }
  | { kind: "option-terminator"; index: number };

export type OptionValue = string | boolean | (string | boolean)[];

type Values = Record<string, OptionValue | undefined>;

type Options = Record<string, ParseArgsOption>;

type IfStrict<T, Yes, No> = T extends false ? No : Yes;

type Scalar<C extends ParseArgsConfig, O extends ParseArgsOption> = IfStrict<
  C["strict"],
  O["type"] extends "string" ? string : O["type"] extends "boolean" ? boolean : string | boolean,
  string | boolean
>;

type ParsedValue<C extends ParseArgsConfig, O extends ParseArgsOption> = O["multiple"] extends true
  ? Scalar<C, O>[]
  : Scalar<C, O>;

type KnownValues<C extends ParseArgsConfig, O extends Options> = {
  -readonly [K in keyof O]?: ParsedValue<C, O[K]>;
} & {
  -readonly [K in keyof O as O[K] extends { default: unknown } ? K : never]: ParsedValue<C, O[K]>;
};

export type ParsedResults<T extends ParseArgsConfig> = ParseArgsConfig extends T
  ? {
      values: Values;
      positionals: string[];
      tokens?: ParseArgsToken[];
    }
  : {
      values: (T extends { options: infer O extends Options }
        ? KnownValues<T, O>
        : Record<never, never>) &
        IfStrict<T["strict"], unknown, Record<string, string | boolean | undefined>>;
      positionals: string[];
    } & (T extends { tokens: true } ? { tokens: ParseArgsToken[] } : Record<never, never>);
