import { isArray } from "./node.ts";
import { ProcessingError } from "./error.ts";
import { escapePointer } from "./pointer.ts";
import type { Resource } from "./resource.ts";
import type { Reference } from "./reference.ts";

/**
 * A context for JSON resource processing and reference resolution.
 *
 * The processing stack represents the current location in the JSON tree,
 * with successive parent frames representing the path from the current node
 * to the root node.
 *
 * @category Context
 */
export interface Context {
  /**
   * The topmost frame on the processing stack.
   * @readonly
   */
  stack: Frame | undefined;

  /**
   * A function to create new frames for the processing stack.
   * @internal
   */
  createFrame: ((parent?: Frame) => Frame) | undefined;

  /**
   * A function to resolve a canonical URI to a resource.
   */
  resolveResource:
    | ((
        uri: string,
        context: Context,
      ) => Promise<Resource | undefined> | Resource | undefined)
    | undefined;

  /**
   * A mapping from nodes to resources.
   * @readonly
   */
  resources: WeakMap<object, Resource> | undefined;

  /**
   * A mapping from canonical URIs to resources.
   * @readonly
   */
  canonical: Map<string, Resource> | undefined;

  /**
   * A mapping from reference nodes to reference resolvers.
   * @readonly
   */
  references: WeakMap<object, Reference> | undefined;

  /**
   * A mapping from unresolved reference nodes to their reference resolvers.
   * @readonly
   */
  unresolved: Map<object, Reference> | undefined;
}

/**
 * Options for configuring a JSON context.
 *
 * @category Context
 */
export interface ContextOptions {
  /**
   * A function to resolve a canonical URI to a resource.
   */
  resolveResource?:
    | ((
        uri: string,
        context: Context,
      ) => Promise<Resource | undefined> | Resource | undefined)
    | undefined;

  /**
   * Initial JSON resources to include in the new context.
   */
  resources?:
    | readonly Resource[]
    | Map<object, Resource>
    | WeakMap<object, Resource>
    | undefined;

  /**
   * Initial mapping from canonical URIs to resources.
   * @internal
   */
  canonical?: Map<string, Resource> | undefined;

  /**
   * Initial mapping from reference nodes to reference resolvers.
   * @internal
   */
  references?: Map<object, Reference> | WeakMap<object, Reference> | undefined;
}

/**
 * Initializes a context for JSON resource processing.
 *
 * @category Context
 */
export function initContext(
  context: Partial<Context>,
  options?: ContextOptions,
): Context {
  // Minimize mixin shape variation.
  if (!("stack" in context)) {
    context.stack = undefined;
  }
  if (!("createFrame" in context)) {
    context.createFrame = undefined;
  }
  if (!("resolveResource" in context)) {
    context.resolveResource = undefined;
  }
  if (!("resources" in context)) {
    context.resources = undefined;
  }
  if (!("canonical" in context)) {
    context.canonical = undefined;
  }
  if (!("references" in context)) {
    context.references = undefined;
  }
  if (!("unresolved" in context)) {
    context.unresolved = undefined;
  }

  // Configure resource resolver.
  if (options?.resolveResource !== undefined) {
    context.resolveResource = options.resolveResource;
  }

  // Configure resources.
  if (options?.resources !== undefined) {
    let resources: IterableIterator<Resource> | undefined;
    if (isArray(options.resources)) {
      context.resources ??= new WeakMap();
      for (const resource of options.resources) {
        context.resources.set(resource.node, resource);
      }
      resources = options.resources[Symbol.iterator]();
    } else if (
      options.resources instanceof Map &&
      context.resources !== undefined
    ) {
      for (const [node, resource] of options.resources.entries()) {
        context.resources.set(node, resource);
      }
      resources = options.resources.values();
    } else {
      context.resources = options.resources;
      context.canonical = options.canonical;
    }

    context.canonical ??= new Map();
    if (resources !== undefined) {
      for (const resource of resources) {
        if (resource.uri !== undefined) {
          context.canonical.set(resource.uri, resource);
          if (resource.uri.endsWith("#")) {
            context.canonical.set(resource.uri.slice(0, -1), resource);
          }
        }
      }
    }
  }

  // Configure references.
  if (options?.references !== undefined) {
    context.references = options.references;
  }

  return context as Context;
}

/**
 * Creates a new shared JSON context.
 *
 * @category Context
 */
export function createContext(options?: ContextOptions): Context {
  const context = initContext({}, options);

  // Initialize shared resource maps.
  if (context.resources === undefined) {
    context.resources = new WeakMap();
  }
  if (context.canonical === undefined) {
    context.canonical = new Map();
  }
  if (context.references === undefined) {
    context.references = new WeakMap();
  }

  return context;
}

/**
 * A stack frame representing a processing location in a JSON tree.
 *
 * @category Context
 */
export interface Frame {
  /**
   * The parent stack frame, or `undefined` if this is the root frame.
   */
  readonly parent: Frame | undefined;

  /**
   * The base URI associated with this stack frame.
   */
  baseUri: string | undefined;

  /**
   * The key of the node being processed in this stack frame.
   */
  nodeKey: string | number | undefined;

  /**
   * The node being processed in this stack frame.
   */
  node: unknown | undefined;
}

/**
 * Creates a new stack frame with the given parent frame.
 *
 * @category Context
 * @internal
 */
export function createFrame(parent?: Frame): Frame {
  return {
    parent,
    baseUri: undefined,
    node: undefined,
    nodeKey: undefined,
  };
}

/**
 * Pushes a new frame onto the stack in the specified context.
 *
 * @category Context
 */
export function pushFrame(context: Context): Frame {
  const frame = (context.createFrame ?? createFrame)(context.stack);
  context.stack = frame;
  return frame;
}

/**
 * Pops and returns the topmost stack frame in the specified context.
 *
 * @category Context
 */
export function popFrame(context: Context): Frame | undefined {
  const frame = context.stack;
  const parent = frame?.parent;
  context.stack = parent;
  return frame;
}

/**
 * Executes a function in a new stack frame in the specified context.
 * Pushes a new frame onto the stack, executes the function, pops the
 * new frame off the stack, and returns the function's result.
 *
 * Detects and prevents frame corruption by ensuring the frame hasn't been
 * replaced during execution. This maintains stack integrity even if the
 * callback throws an error.
 *
 * Supports both synchronous and asynchronous functions. For async functions,
 * the frame is popped only after the returned Promise settles. Care must be
 * taken not to enter concurrent nested frames in the same context.
 *
 * @category Context
 */
export function nestFrame<F extends (frame: Frame) => unknown>(
  context: Context,
  fn: F,
): ReturnType<F> {
  const frame = pushFrame(context);

  let result: unknown;
  try {
    result = fn(frame);
  } catch (error) {
    unwindFrame(context, frame, error);
  }

  if (!(result instanceof Promise)) {
    return unnestFrame(context, frame, result as ReturnType<F>);
  } else {
    return result.then(
      unnestFrame.bind(undefined, context, frame),
      unwindFrame.bind(undefined, context, frame),
    ) as ReturnType<F>;
  }
}

/** @internal */
function unnestFrame<T>(context: Context, frame: Frame, result: T): T {
  if (context.stack !== frame) {
    throw new Error("Stack frame was replaced during execution");
  }
  popFrame(context);
  return result;
}

/** @internal */
function unwindFrame(context: Context, frame: Frame, error: unknown): never {
  if (context.stack === frame) {
    popFrame(context);
  }
  throw error;
}

/**
 * Returns the topmost frame on the stack in the given context.
 *
 * @throws ProcessingError if the stack is uninitialized.
 * @category Context
 */
export function currentFrame(context: Context): Frame {
  const frame = context.stack;
  if (frame === undefined) {
    throw new ProcessingError("Uninitialized stack");
  }
  return frame;
}

/**
 * Returns the base URI of the topmost stack frame that defines a base URI.
 * Traverses up the stack until a frame with a base URI is found, or until
 * the root frame is reached.
 *
 * @category Context
 */
export function currentBaseUri(
  frame: Context | Frame | undefined,
): string | undefined {
  if (frame !== undefined && "stack" in frame) {
    frame = frame.stack;
  }

  while (frame !== undefined) {
    if (frame.baseUri !== undefined) {
      return frame.baseUri;
    }
    frame = frame.parent;
  }
  return undefined;
}

/**
 * Returns the node key path for the stack frame.
 *
 * @category Context
 */
export function currentPath(
  frame: Context | Frame | undefined,
): (string | number)[] {
  if (frame !== undefined && "stack" in frame) {
    frame = frame.stack;
  }
  if (frame === undefined) {
    return [];
  }

  const path = currentPath(frame.parent);
  if (frame.nodeKey !== undefined) {
    path.push(frame.nodeKey);
  }
  return path;
}

/**
 * Returns a JSON Pointer following the node key path of the stack frame.
 *
 * @category Context
 */
export function currentPointer(frame: Context | Frame | undefined): string {
  if (frame !== undefined && "stack" in frame) {
    frame = frame.stack;
  }
  if (frame === undefined) {
    return "";
  }

  let pointer = currentPointer(frame.parent);
  if (frame.nodeKey !== undefined) {
    pointer += "/" + escapePointer(String(frame.nodeKey));
  }
  return pointer;
}

/**
 * Returns a URI reference to the stack frame consisting of the canonical URI
 * for the nearest canonical frame with a JSON pointer in the fragment part.
 *
 * @category Context
 */
export function currentLocation(
  context: Context,
  frame: Frame | undefined = context.stack,
): string {
  if (frame === undefined) {
    return "";
  }

  // A canonical URI represents a document boundary.
  const resource = context.resources?.get(frame.node as object);
  if (resource?.uri !== undefined) {
    return resource.uri;
  }

  let uri: string;
  if (frame.parent !== undefined) {
    uri = currentLocation(context, frame.parent);
    if (!uri.includes("#")) {
      uri += "#";
    }
  } else {
    uri = "#";
  }

  const key = frame.nodeKey;
  if (key !== undefined) {
    uri += "/" + escapePointer(String(key));
  }

  return uri;
}
