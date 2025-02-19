export type { ProcessingErrorOptions } from "./error.ts";
export { ProcessingError, ResolutionError } from "./error.ts";

export type { Node, NodeType, NodeList } from "./node.ts";
export {
  referToType,
  isNull,
  isBoolean,
  isInteger,
  isNumber,
  isString,
  isArray,
  isObject,
  isType,
  unicodeLength,
  unicodeCompare,
  getChild,
  getChildren,
  getDescendants,
  equal,
  compare,
  sort,
  Fragment,
  Payload,
} from "./node.ts";

export {
  resolvePointer,
  parsePointer,
  formatPointer,
  escapePointer,
  unescapePointer,
  parseRelativePointer,
} from "./pointer.ts";

export type { Context, ContextOptions, Frame } from "./context.ts";
export {
  initContext,
  createContext,
  createFrame,
  pushFrame,
  popFrame,
  nestFrame,
  currentFrame,
  currentBaseUri,
  currentPath,
  currentPointer,
  currentLocation,
} from "./context.ts";

export type { Resource } from "./resource.ts";
export {
  createResource,
  getResource,
  setResource,
  currentResource,
  getResourceAnchor,
  setResourceAnchor,
  resolveResource,
  resolveResourceFragment,
  resolveResourceUri,
} from "./resource.ts";

export type { Reference } from "./reference.ts";
export {
  createReference,
  getReference,
  traverseReference,
  registerReference,
  resolveReferences,
  detectReference,
  detectReferences,
  treeShakeReferences,
} from "./reference.ts";
