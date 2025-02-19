import { parseUriReference, resolveUri } from "tool-uri";
import { ResolutionError } from "./error.ts";
import { isArray, isObject, getChild } from "./node.ts";
import { escapePointer } from "./pointer.ts";
import type { Context } from "./context.ts";
import { nestFrame, currentBaseUri, currentLocation } from "./context.ts";
import type { Resource } from "./resource.ts";
import { resolveResourceUri } from "./resource.ts";

/**
 * A JSON reference resolver.
 *
 * References are tracked in two maps:
 * 1. WeakMap for node-to-reference mapping (permanent)
 * 2. Regular Map for unresolved references (cleared on resolution)
 *
 * @category Reference
 */
export interface Reference {
  /**
   * The keyword used to define this reference.
   */
  readonly key: string;

  /**
   * The URI of the target node.
   */
  readonly uri: string;

  /**
   * The dereferenced target node, if successfully resolved.
   */
  target: unknown | undefined;
}

/**
 * Creates a new reference resolver for the given target node URI.
 *
 * @category Reference
 * @internal
 */
export function createReference(key: string, uri: string): Reference {
  return {
    key,
    uri,
    target: undefined,
  };
}

/**
 * Returns the resolver for the given reference node in the specified context.
 *
 * @category Reference
 */
export function getReference(
  context: Context,
  node: unknown,
): Reference | undefined {
  return context.references?.get(node as object);
}

/**
 * Registers an unresolved reference for a node that should resolve
 * to the given target URI. Returns the existing reference resolver
 * if the reference has already been registered.
 *
 * The node is tracked in both the permanent references WeakMap
 * and the temporary unresolved Map until resolution is attempted.
 *
 * @category Reference
 */
export function registerReference(
  context: Context,
  node: object,
  key: string,
  uri: string,
): Reference {
  let references = context.references;
  let resolver = references?.get(node);
  if (resolver === undefined) {
    resolver = createReference(key, uri);

    if (references === undefined) {
      context.references = references = new WeakMap();
    }
    references.set(node, resolver);

    let unresolved = context.unresolved;
    if (unresolved === undefined) {
      context.unresolved = unresolved = new Map();
    }
    unresolved.set(node, resolver);
  }
  return resolver;
}

/**
 * Resolves all tracked but unresolved references relative to the
 * given resource in the specified context.
 *
 * Clears all unresolved references, regardless of whether they were
 * successfully resolved. This ensures references are only resolved once,
 * even if some fail.
 *
 * @throws ResolutionError if one or more references could not be resolved.
 * Multiple resolution failures are aggregated into a single error
 * with detailed causes.
 * @category Reference
 */
export function resolveReferences(
  context: Context,
  resource: Resource | undefined,
): void {
  const unresolved = context.unresolved;
  if (unresolved === undefined) {
    return;
  }

  let cause: ResolutionError[] | ResolutionError | undefined;
  for (const [node, reference] of unresolved) {
    // Clear the unresolved reference.
    unresolved.delete(node);
    try {
      reference.target = resolveResourceUri(context, resource, reference.uri);
    } catch (error) {
      if (!(error instanceof ResolutionError)) {
        throw error;
      }
      if (cause === undefined) {
        cause = error;
      } else if (!Array.isArray(cause)) {
        cause = [cause, error];
      } else {
        cause.push(error);
      }
    }
  }

  if (Array.isArray(cause)) {
    let message = "Unable to resolve multiple references";
    for (const error of cause) {
      message += "\n  " + error.message;
    }
    throw new ResolutionError(message, {
      location: currentLocation(context),
      cause,
    });
  } else if (cause !== undefined) {
    throw cause;
  }
}

/**
 * Registers the given node as a reference in the specified context if it
 * contains a reference keyword. If a base URI is present in the context,
 * the reference URI is resolved against it. Otherwise, the reference URI
 * must be absolute or fragment-only.
 *
 * @category Reference
 */
export function detectReference(
  context: Context,
  node: unknown,
  key: string = "$ref",
): Reference | undefined {
  let uri = getChild(node, key);
  if (typeof uri !== "string") {
    return undefined;
  }

  const baseUri = currentBaseUri(context);
  if (baseUri !== undefined) {
    uri = resolveUri(baseUri, uri).href;
  } else {
    parseUriReference(uri); // validate
  }

  return registerReference(context, node as object, key, uri as string);
}

/**
 * Registers all references in the given node and its descendants.
 * Maintains stack frame context during traversal for error reporting
 * and base URI inheritance.
 *
 * @category Reference
 */
export function detectReferences(
  context: Context,
  node: unknown,
  keys: readonly string[] | string = "$ref",
): void {
  if (isArray(keys)) {
    for (const key of keys) {
      detectReference(context, node, key);
    }
  } else {
    detectReference(context, node, keys);
  }

  if (isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const child = node[i]!;
      nestFrame(context, (frame) => {
        frame.nodeKey = i;
        frame.node = child;
        detectReferences(context, child, keys);
      });
    }
  } else if (isObject(node)) {
    for (const [key, child] of Object.entries(node)) {
      nestFrame(context, (frame) => {
        frame.nodeKey = key;
        frame.node = child;
        detectReferences(context, child, keys);
      });
    }
  }
}

/**
 * Tree-shakes the given root nodes, returning a mapping from referenced
 * nodes to rewritten replacements. References in the rewritten nodes
 * will point to new locations under the specified definitions URI.
 *
 * Requires that all references have been previously resolved.
 * Maintains reference structure while relocating non-root nodes.
 *
 * @category Reference
 */
export function treeShakeReferences(
  context: Context,
  options: {
    /**
     * The root nodes to preserve, along with all reachable references.
     */
    readonly roots: readonly object[];

    /**
     * The base URI for relocated references.
     */
    readonly defsUri: string;

    /**
     * An additional transformation to apply when rewriting nodes.
     */
    readonly transform?: ((node: unknown) => unknown) | undefined;
  },
): {
  /**
   * The transformed root nodes with updated references
   */
  roots: object[];

  /**
   * The referenced nodes to be inserted at defsUri
   */
  defs: Record<string, object>;
} {
  const visited = new Set<unknown>();
  const refs = new Map<unknown, string>();
  const defs: Record<string, object> = {};

  for (const root of options.roots) {
    collectReferences(root);
  }
  const roots = options.roots.map(rewriteNode) as object[];
  return { roots, defs };

  function collectReferences(node: unknown): void {
    if (!isObject(node) || visited.has(node)) {
      return;
    }
    visited.add(node);

    const ref = getReference(context, node);
    if (
      ref?.target !== undefined &&
      !options.roots.includes(ref.target as object)
    ) {
      if (!refs.has(ref.target)) {
        const name = ref.uri.slice(
          Math.max(ref.uri.lastIndexOf("/"), ref.uri.lastIndexOf("#")) + 1,
        );
        let key = name;
        let counter = 1;
        while (key in defs) {
          key = name + counter;
          counter += 1;
        }
        refs.set(ref.target, key);
      }
      collectReferences(ref.target);
    }

    if (isArray(node)) {
      for (const item of node) {
        collectReferences(item);
      }
    } else if (isObject(node)) {
      for (const value of Object.values(node)) {
        collectReferences(value);
      }
    }
  }

  function rewriteNode(node: unknown): unknown {
    const ref = getReference(context, node);
    const refName = refs.get(ref?.target);

    if (refName !== undefined) {
      if (!(refName in defs)) {
        defs[refName] = undefined!;
        defs[refName] = rewriteNode(ref!.target) as object;
      }
      node = { [ref!.key]: options.defsUri + "/" + escapePointer(refName) };
    } else if (isArray(node)) {
      const result: unknown[] = [];
      for (const item of node) {
        result.push(isObject(item) ? rewriteNode(item) : item);
      }
      node = result;
    } else if (isObject(node)) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        result[key] = isObject(value) ? rewriteNode(value) : value;
      }
      node = result;
    }

    if (options.transform !== undefined) {
      node = options.transform(node);
    }
    return node;
  }
}
