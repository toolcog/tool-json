import { ResolutionError } from "./error.ts";
import { resolvePointer } from "./pointer.ts";
import type { Context, Frame } from "./context.ts";
import { currentLocation } from "./context.ts";

/**
 * An identifiable JSON resource.
 *
 * @category Resource
 */
export interface Resource {
  /**
   * The canonical URI of the resource, if it has one. A resource without
   * a canonical URI can only be accessed by node reference.
   * @readonly
   */
  uri: string | undefined;

  /**
   * The node associated with the resource.
   */
  readonly node: object;

  /**
   * The base URI of the resource, if it has one.
   */
  baseUri: string | undefined;

  /**
   * The named anchor nodes associated with the resource. Anchors provide
   * named entry points into a resource, independent of the node structure.
   * @readonly
   */
  anchors: Map<string, object> | undefined;
}

/**
 * Creates a new resource for the given node.
 *
 * @category Resource
 */
export function createResource(
  canonicalUri: string | undefined,
  node: object,
): Resource {
  return {
    uri: canonicalUri,
    node,
    baseUri: canonicalUri,
    anchors: undefined,
  };
}

/**
 * Returns the resource associated with the given node in the specified context.
 *
 * @category Resource
 */
export function getResource(
  context: Context,
  node: unknown,
): Resource | undefined {
  return context.resources?.get(node as object);
}

/**
 * Associates the given resource with the specified context.
 *
 * @category Resource
 */
export function setResource(context: Context, resource: Resource): void {
  let resources = context.resources;
  if (resources === undefined) {
    context.resources = resources = new WeakMap();
  }
  resources.set(resource.node, resource);

  const canonicalUri = resource.uri;
  if (canonicalUri !== undefined) {
    let canonical = context.canonical;
    if (canonical === undefined) {
      context.canonical = canonical = new Map();
    }
    canonical.set(canonicalUri, resource);

    if (canonicalUri.endsWith("#")) {
      canonical.set(canonicalUri.slice(0, -1), resource);
    }
  }
}

/**
 * Returns the nearest enclosing canonical resource, or the root resource,
 * if no canonical resource is found.
 *
 * @category Resource
 */
export function currentResource(
  context: Context,
  frame: Frame | undefined = context.stack,
): Resource | undefined {
  if (frame === undefined) {
    return undefined;
  }

  let current: Resource | undefined;
  while (frame !== undefined) {
    const resource = getResource(context, frame.node);
    if (resource !== undefined) {
      current = resource;
      if (resource.uri !== undefined) {
        break;
      }
    }
    frame = frame.parent;
  }
  return current;
}

/**
 * Returns the anchor node with the given name in the specified resource.
 *
 * @category Resource
 */
export function getResourceAnchor(
  resource: Resource,
  name: string,
): object | undefined {
  return resource.anchors?.get(name);
}

/**
 * Associates an anchor node with the given name in the specified resource.
 *
 * @category Resource
 */
export function setResourceAnchor(
  resource: Resource,
  name: string,
  anchor: object,
): void {
  let anchors = resource.anchors;
  if (anchors === undefined) {
    resource.anchors = anchors = new Map();
  }
  anchors.set(name, anchor);
}

/**
 * Returns the resource associated with the given canonical URI
 * in the specified context.
 *
 * @category Resource
 */
export async function resolveResource(
  context: Context,
  canonicalUri: string,
): Promise<Resource | undefined> {
  let resource = context.canonical?.get(canonicalUri);
  if (resource === undefined && context.resolveResource !== undefined) {
    resource = await context.resolveResource(canonicalUri, context);
    if (resource !== undefined) {
      setResource(context, resource);
    }
  }
  return resource;
}

/**
 * Resolves a fragment reference relative to the given resource in the
 * specified context. The fragment may be a JSON Pointer or an anchor name,
 * and must not begin with a `#`.
 *
 * Fragment resolution has three modes:
 * 1. Empty fragment returns the resource node
 * 2. Fragment starting with "/" uses JSON Pointer resolution
 * 3. Other fragments are treated as anchor names
 *
 * @throws ResolutionError if the fragment cannot be dereferenced.
 * @category Resource
 */
export function resolveResourceFragment(
  context: Context,
  resource: Resource,
  fragment: string,
): unknown {
  if (fragment.length === 0) {
    return resource.node;
  }

  if (fragment.startsWith("/")) {
    return resolvePointer(fragment, resource.node);
  }

  const node = getResourceAnchor(resource, fragment);
  if (node === undefined) {
    throw new ResolutionError(
      "Cannot resolve plain name fragment " +
        JSON.stringify(fragment) +
        " because the current resource has no corresponding anchor",
      { location: currentLocation(context) },
    );
  }
  return node;
}

/**
 * Resolves a URI reference by first resolving its canonical URI part in the
 * specified context, and then resolving its fragment part.
 *
 * Resolution occurs in two phases:
 * 1. Canonical URI resolution to find the base resource
 * 2. Fragment resolution within that resource
 *
 * The base resource comes from either:
 * - The canonical part of the URI if present
 * - The provided resource for fragment-only URIs
 *
 * @throws ResolutionError if the URI cannot be dereferenced.
 * @category Resource
 */
export async function resolveResourceUri(
  context: Context,
  resource: Resource | undefined,
  uri: string,
): Promise<unknown> {
  const [canonicalUri, fragment] = uri.split("#", 2) as [string, string?];

  // Resolve the canonical URI part.
  if (canonicalUri.length !== 0) {
    resource = await resolveResource(context, canonicalUri);
    if (resource === undefined) {
      throw new ResolutionError(
        "Unknown resource " + JSON.stringify(canonicalUri),
        { location: currentLocation(context) },
      );
    }
  } else if (resource === undefined) {
    throw new ResolutionError(
      "Cannot resolve relative URI reference " +
        JSON.stringify(uri) +
        " because the stack has no base node",
      { location: currentLocation(context) },
    );
  }

  // Resolve the fragment part.
  let node: unknown;
  if (fragment !== undefined && fragment.length !== 0) {
    node = resolveResourceFragment(context, resource, fragment);
  } else {
    node = resource.node;
  }
  return node;
}
