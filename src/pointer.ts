import { isDigit } from "tool-uri";
import { ResolutionError } from "./error.ts";
import { getChild } from "./node.ts";

/** @internal */
interface InputBuffer {
  readonly input: string;
  offset: number;
  limit: number;
}

/**
 * Resolves a JSON Pointer relative to the given node.
 *
 * @throws TypeError if the pointer is invalid.
 * @throws ResolutionError if the pointer does not resolve.
 * @category Pointer
 */
export function resolvePointer(pointer: string, node: unknown): unknown {
  if (pointer.length !== 0 && !pointer.startsWith("/")) {
    throw new TypeError(
      'Expected JSON pointer to start with "/": ' + JSON.stringify(pointer),
    );
  }

  let offset = 0;
  while (offset < pointer.length) {
    // Scan for the end of the next token, or the end of the string.
    let end = pointer.indexOf("/", offset + 1);
    if (end === -1) {
      end = pointer.length;
    }

    // Unescape the next token.
    const token = unescapePointer(pointer.slice(offset + 1, end));

    // Resolve the child corresponding to the next token.
    const next = getChild(node, token);
    if (next === undefined) {
      throw new ResolutionError(
        "Property " +
          JSON.stringify(token) +
          " not found while resolving JSON pointer " +
          JSON.stringify(pointer),
        { location: pointer.slice(0, end) },
      );
    }

    node = next;
    offset = end;
  }

  return node;
}

/**
 * Parses a JSON Pointer into an array of reference tokens.
 *
 * @throws TypeError if the pointer is invalid.
 * @category Pointer
 */
export function parsePointer(input: string): string[];

/** @internal */
export function parsePointer(buf: InputBuffer): string[];

export function parsePointer(input: string | InputBuffer): string[] {
  const buf =
    typeof input === "string" ?
      { input, offset: 0, limit: input.length }
    : input;

  if (
    buf.offset < buf.limit &&
    buf.input.charCodeAt(buf.offset) !== 0x2f /*"/"*/
  ) {
    throw new TypeError(
      'Expected JSON pointer to start with "/": ' + JSON.stringify(buf.input),
    );
  }

  const tokens: string[] = [];

  while (buf.offset < buf.limit) {
    // Scan for the end of the next token, or the end of the string.
    let end = buf.input.indexOf("/", buf.offset + 1);
    if (end === -1) {
      end = buf.limit;
    }

    // Add the next unescaped token..
    tokens.push(unescapePointer(buf.input.slice(buf.offset + 1, end)));

    buf.offset = end;
  }

  return tokens;
}

/**
 * Formats a JSON Pointer from an array of reference tokens.
 *
 * @category Pointer
 */
export function formatPointer(tokens: readonly (string | number)[]): string {
  let pointer = "";
  for (const token of tokens) {
    pointer += "/" + escapePointer(String(token));
  }
  return pointer;
}

/**
 * Escapes a JSON Pointer token for safe inclusion in a JSON Pointer string.
 *
 * @category Pointer
 */
export function escapePointer(input: string): string {
  let output = "";
  let offset = 0;
  let start = 0;

  while (offset < input.length) {
    const c = input.charCodeAt(offset);
    if (c === 0x7e /*"~"*/) {
      output += input.slice(start, offset);
      output += "~0";
      offset += 1;
      start = offset;
    } else if (c === 0x2f /*"/"*/) {
      output += input.slice(start, offset);
      output += "~1";
      offset += 1;
      start = offset;
    } else {
      offset += 1;
    }
  }

  if (start === 0) {
    output = input;
  } else if (start < input.length) {
    output += input.slice(start);
  }
  return output;
}

/**
 * Unescapes a JSON Pointer reference token.
 *
 * @category Pointer
 */
export function unescapePointer(input: string): string {
  let output = "";
  let offset = 0;
  let start = 0;

  while (offset < input.length) {
    let c = input.charCodeAt(offset);
    if (c === 0x7e /*"~"*/) {
      output += input.slice(start, offset);
      offset += 1;
      c = offset < input.length ? input.charCodeAt(offset) : -1;
      if (c === 0x30 /*"0"*/) {
        output += "~";
      } else if (c === 0x31 /*"1"*/) {
        output += "/";
      } else {
        throw new TypeError(
          "Invalid JSON pointer escape sequence: " +
            JSON.stringify(input.slice(offset - 1, offset + 1)),
        );
      }
      offset += 1;
      start = offset;
    } else {
      offset += 1;
    }
  }

  if (start === 0) {
    output = input;
  } else if (start < input.length) {
    output += input.slice(start);
  }
  return output;
}

/**
 * Parses a relative JSON Pointer into a non-negative integer prefix
 * and an array of reference tokens.
 *
 * @throws TypeError if the relative pointer is invalid.
 * @category Pointer
 * @internal
 */
export function parseRelativePointer(input: string): {
  prefix: number;
  tokens: string[] | "#" | undefined;
};

/** @internal */
export function parseRelativePointer(buf: InputBuffer): {
  prefix: number;
  tokens: string[] | "#" | undefined;
};

export function parseRelativePointer(input: string | InputBuffer): {
  prefix: number;
  tokens: string[] | "#" | undefined;
} {
  const buf =
    typeof input === "string" ?
      { input, offset: 0, limit: input.length }
    : input;

  let c = buf.offset < buf.limit ? buf.input.charCodeAt(buf.offset) : -1;
  if (!isDigit(c)) {
    throw new TypeError(
      "Expected relative JSON pointer to start with a digit: " +
        JSON.stringify(buf.input),
    );
  }
  buf.offset += 1;
  let prefix = c - 0x30; /*"0"*/

  if (prefix !== 0) {
    while (
      buf.offset < buf.limit &&
      ((c = buf.input.charCodeAt(buf.offset)), isDigit(c))
    ) {
      buf.offset += 1;
      prefix = prefix * 10 + (c - 0x30) /*"0"*/;
    }
  }

  c = buf.offset < buf.limit ? buf.input.charCodeAt(buf.offset) : -1;
  let tokens: string[] | "#" | undefined;
  if (c === 0x23 /*"#"*/) {
    buf.offset += 1;
    tokens = "#";
  } else if (c === 0x2f /*"/"*/) {
    tokens = parsePointer(buf);
  }

  if (typeof input === "string" && buf.offset !== input.length) {
    throw new TypeError(
      "Invalid relative JSON pointer " + JSON.stringify(buf.input),
    );
  }

  return { prefix, tokens };
}
