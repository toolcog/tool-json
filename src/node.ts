/**
 * A node in a tree of JSON values.
 *
 * @category Node
 */
export type Node = unknown;

/**
 * An enumeration of JSON node type identifiers.
 *
 * @category Node
 */
export type NodeType =
  | "null"
  | "boolean"
  | "integer"
  | "number"
  | "string"
  | "array"
  | "object";

/**
 * Returns a phrase that grammatically refers to the given type.
 *
 * @category Node
 * @internal
 */
export function referToType(type: string): string {
  switch (type) {
    case "null":
      return "null";
    case "boolean":
      return "a boolean";
    case "integer":
      return "an integer";
    case "number":
      return "a number";
    case "string":
      return "a string";
    case "array":
      return "an array";
    case "object":
      return "an object";
    default:
      return ("AEIOUaeiou".includes(type.charAt(0)) ? "an " : "a ") + type;
  }
}

/**
 * Returns `true` if the given node is `null`.
 *
 * @category Node
 */
export function isNull(node: unknown): node is null {
  return node === null;
}

/**
 * Returns `true` if the given node is a boolean.
 *
 * @category Node
 */
export function isBoolean(node: unknown): node is boolean {
  return typeof node === "boolean";
}

/**
 * Returns `true` if the given node is a mathematical integer.
 *
 * @category Node
 */
export function isInteger(node: unknown): node is number {
  return Number.isInteger(node);
}

/**
 * Returns `true` if the given node is a number.
 *
 * @category Node
 */
export function isNumber(node: unknown): node is number {
  return typeof node === "number";
}

/**
 * Returns `true` if the given node is a string.
 *
 * @category Node
 */
export function isString(node: unknown): node is string {
  return typeof node === "string";
}

/**
 * Returns `true` if the given node is an array.
 *
 * @category Node
 */
export function isArray(node: unknown): node is readonly unknown[] {
  return Array.isArray(node);
}

/**
 * Returns `true` if the given node is an object.
 *
 * @category Node
 */
export function isObject(
  node: unknown,
): node is { readonly [key: string]: unknown } {
  return node !== null && typeof node === "object";
}

/**
 * Returns `true` if the given node conforms to a specified JSON type.
 *
 * @category Node
 */
export function isType(type: string, node: unknown): boolean {
  switch (type) {
    case "null":
      return isNull(node);
    case "boolean":
      return isBoolean(node);
    case "integer":
      return isInteger(node);
    case "number":
      return isNumber(node);
    case "string":
      return isString(node);
    case "array":
      return isArray(node);
    case "object":
      return isObject(node);
    default:
      return false;
  }
}

/**
 * Returns the number of Unicode code points in the given string.
 *
 * @category Node
 */
export function unicodeLength(input: string): number {
  let length = 0;
  for (let i = 0; i < input.length; i += 1) {
    length += 1;
    if (input.charCodeAt(i) >= 0xd800 && input.charCodeAt(i) <= 0xdbff) {
      // Count surrogate pairs as a single character.
      i += 1;
    }
  }
  return length;
}

/**
 * Compares two strings by Unicode code points.
 *
 * @category Node
 */
export function unicodeCompare(a: string, b: string): -1 | 0 | 1 {
  const minLength = Math.min(a.length, b.length);
  for (let i = 0; i < minLength; i += 1) {
    const ai = a.codePointAt(i)!;
    const bi = b.codePointAt(i)!;
    if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  return (
    a.length < b.length ? -1
    : a.length > b.length ? 1
    : 0
  );
}

/**
 * Returns the child of the given node with the specified key.
 *
 * @category Node
 */
export function getChild(node: unknown, key: PropertyKey): unknown {
  if (node === null || typeof node !== "object") {
    return undefined;
  }
  return (node as { readonly [key: PropertyKey]: unknown })[key];
}

/**
 * Returns the children of the given node.
 *
 * @category Node
 */
export function getChildren(node: unknown): unknown[] {
  if (node === null || typeof node !== "object") {
    return [];
  }
  return Object.values(node);
}

/**
 * Returns an iterator over all descendants of the given node.
 *
 * @category Node
 */
export function* getDescendants(node: unknown): IterableIterator<unknown> {
  if (node === null || typeof node !== "object") {
    return;
  }

  for (const child of Object.values(node)) {
    yield child;
    yield* getDescendants(child);
  }
}

/**
 * Returns `true` if the given values are deeply equal.
 *
 * @category Node
 */
export function equal(lhs: unknown, rhs: unknown): boolean {
  if (lhs === rhs) {
    return true;
  } else if (
    lhs === null ||
    typeof lhs !== "object" ||
    rhs === null ||
    typeof rhs !== "object"
  ) {
    return false;
  }

  if (Array.isArray(lhs)) {
    if (!Array.isArray(rhs) || lhs.length !== rhs.length) {
      return false;
    }
    for (let i = 0; i < lhs.length; i += 1) {
      if (!equal(lhs[i], rhs[i])) {
        return false;
      }
    }
    return true;
  }

  const lhsKeys = Object.keys(lhs);
  const rhsKeys = Object.keys(rhs);
  if (lhsKeys.length !== rhsKeys.length) {
    return false;
  }
  for (const key of lhsKeys) {
    if (
      !equal(
        (lhs as { [key: string]: unknown })[key],
        (rhs as { [key: string]: unknown })[key],
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Returns the relative order of the given values.
 *
 * @returns `0` if the values are equal, `-1` if the left node is less than
 * the right node, and `1` if the left node is greater than the right node.
 * Returns `undefined` if the values are not comparable.
 * @category Node
 */
export function compare(lhs: unknown, rhs: unknown): -1 | 0 | 1 | undefined {
  if (lhs === rhs) {
    return 0;
  }

  if (typeof lhs === "number" && typeof rhs === "number") {
    return (
      lhs < rhs ? -1
      : lhs > rhs ? 1
      : 0
    );
  }

  if (typeof lhs === "string" && typeof rhs === "string") {
    return unicodeCompare(lhs, rhs);
  }

  return undefined;
}

/**
 * In-place merge sort that doesn't skip `undefined` values,
 * because `Array.prototype.sort` is evil.
 *
 * @category Node
 */
export function sort<T>(array: T[], compare: (a: T, b: T) => number): T[] {
  const buffer = new Array<T>(array.length);
  let width = 1;
  while (width < array.length) {
    let lower = 0;
    while (lower < array.length - width) {
      const middle = lower + width - 1;
      const upper = Math.min(lower + width * 2 - 1, array.length - 1);
      merge(array, buffer, lower, middle, upper, compare);
      lower += width * 2;
    }
    width += width;
  }
  return array;
}

/** @internal */
function merge<T>(
  array: T[],
  buffer: T[],
  lower: number,
  middle: number,
  upper: number,
  compare: (a: T, b: T) => number,
): void {
  let left = lower;
  let right = middle + 1;
  let index = lower;

  for (let i = lower; i <= upper; i += 1) {
    buffer[i] = array[i]!;
  }

  while (left <= middle && right <= upper) {
    if (compare(buffer[left]!, buffer[right]!) <= 0) {
      array[index] = buffer[left]!;
      left += 1;
    } else {
      array[index] = buffer[right]!;
      right += 1;
    }
    index += 1;
  }

  while (left <= middle) {
    array[index] = buffer[left]!;
    left += 1;
    index += 1;
  }
}

/**
 * A list of nodes, distinct from a JSON array.
 *
 * @category Node
 */
export type NodeList<T = Node> = T[];

/**
 * A transparent wrapper for node list that should be spread into its parent.
 *
 * @category Node
 */
export class Fragment<T = unknown> {
  readonly nodes: readonly T[];

  constructor(nodes: readonly T[]) {
    this.nodes = nodes;
  }

  valueOf(): readonly T[] {
    return this.nodes;
  }

  toJSON(): readonly T[] {
    return this.nodes;
  }

  toString(): string {
    return String(this.nodes);
  }
}

/**
 * A transparent value wrapper with associated headers.
 *
 * @category Node
 */
export class Payload<T = unknown> {
  readonly value: T;
  readonly headers: { readonly [name: string]: string };

  constructor(value: T, headers: { readonly [name: string]: string }) {
    this.value = value;
    this.headers = headers;
  }

  valueOf(): T {
    return this.value;
  }

  toJSON(): T {
    return this.value;
  }

  toString(): string {
    return String(this.value);
  }
}
