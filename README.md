# Tool JSON

[![Package](https://img.shields.io/badge/npm-0.1.0-ae8c7e?labelColor=3b3a37)](https://www.npmjs.com/package/tool-json)
[![License](https://img.shields.io/badge/license-MIT-ae8c7e?labelColor=3b3a37)](https://opensource.org/licenses/MIT)

A foundational library for processing JSON documents with references. While many libraries can parse and manipulate JSON, handling references between documents remains a complex challenge. Tool JSON provides a complete infrastructure for reference resolution, document processing, and graph manipulation.

## Overview

Modern JSON formats like JSON Schema and OpenAPI rely heavily on references within and between documents. These references create complex dependency graphs that are difficult to process reliably. Tool JSON solves this by providing:

- A robust reference resolution system that handles both internal and external references
- Stack-based error tracking that provides precise location information for debugging
- Resource management to efficiently handle referenced documents
- Tree-shaking to extract minimal, self-contained document subsets

The library is designed to be a foundation for building higher-level tools that work with reference-heavy JSON formats.

## Key Features

- **Reference Resolution**: Resolve URI-based references (`$ref`) between JSON documents with proper error handling and cycle detection
- **Context Management**: Track document locations and base URIs for precise error reporting and debugging
- **Resource Handling**: Cache and manage referenced resources to avoid redundant processing
- **Dynamic Loading**: Lazily load external resources on-demand through configurable resolvers
- **Tree Shaking**: Extract minimal, self-contained subsets of JSON documents by analyzing reference graphs
- **Transform Pipeline**: Transform documents while maintaining reference integrity

## Use Cases

Tool JSON is particularly useful for:

- Extracting minimal JSON Schema subsets for LLM tool use
- Transforming JSON Schema documents while preserving reference structure
- Processing OpenAPI descriptions with shared schema references
- Building tools that work with reference-heavy JSON formats

## Installation

To install the package, run:

```bash
npm install tool-json
```

## Usage

Tool JSON's power comes from its layered approach to reference handling. Let's explore the key concepts:

### Basic Reference Resolution

References are the foundation of modern JSON document formats. Tool JSON makes reference handling straightforward and reliable:

```typescript
import { createContext, detectReference, resolveReferences } from "tool-json";

// Create a processing context
const context = createContext();

// Define nodes with references
const stringType = { type: "string" };
const schema = {
  type: "object",
  properties: {
    name: { $ref: "#/definitions/string" }
  },
  definitions: {
    string: stringType
  }
};

// Detect and resolve references
detectReferences(context, schema);
await resolveReferences(context, { node: schema });

// Traverse the resolved reference
const resolved = getReference(context, schema.properties.name);
console.log(resolved?.target === stringType); // true
```

The context tracks references and maintains error locations, making debugging straightforward when things go wrong.

### Resource Management

Real-world JSON documents often span multiple files. Tool JSON's resource system handles external references elegantly:

```typescript
import { createContext, createResource, setResource } from "tool-json";

// Create resources with canonical URIs
const context = createContext();
const stringType = createResource("https://example.com/string.json", {
  type: "string"
});
setResource(context, stringType);

// References can be resolved across resources
const schema = {
  type: "object",
  properties: {
    name: { $ref: "https://example.com/string.json" }
  }
};

detectReference(context, schema.properties.name);
await resolveReferences(context, { node: schema });
```

Resources can have canonical URIs and named anchors, enabling flexible reference patterns while maintaining strict URI semantics.

### Resource Loading

For larger document sets or distributed environments, Tool JSON supports dynamic loading of resources on-demand:

```typescript
import { createContext, resolveReferences } from "tool-json";

// Create a context with a dynamic resource resolver
const context = createContext({
  resolveResource: async (uri) => {
    if (uri.startsWith("https://example.com/schemas/")) {
      // Dynamically fetch and create resources when they're first referenced
      const response = await fetch(uri);
      const data = await response.json();
      return createResource(uri, data);
    }
    return undefined;
  }
});

// References to external URIs will trigger lazy loading
const schema = {
  type: "object",
  properties: {
    user: { $ref: "https://example.com/schemas/user.json" }
  }
};

detectReference(context, schema.properties.user);
await resolveReferences(context, { node: schema });
// The user schema is automatically loaded when needed
```

Dynamic loading integrates seamlessly with the reference resolution process, allowing you to:

- Load resources only when they're actually needed
- Implement custom caching, fetching, or authorization logic
- Handle distributed schema repositories
- Support virtual resources that don't directly correspond to files

### Tree-Shaking

A common need is extracting minimal, self-contained subsets of larger JSON documents. Tool JSON's tree-shaking analyzes reference graphs to include only what's needed:

```typescript
import { createContext, treeShakeReferences } from "tool-json";

// Create a schema with shared references
const context = createContext();
const schema = {
  type: "object",
  properties: {
    name: { $ref: "#/definitions/string" },
    age: { $ref: "#/definitions/number" }
  },
  definitions: {
    string: { type: "string" },
    number: { type: "number" }
  }
};

// Extract a minimal schema for the name property
const nameSchema = schema.properties.name;
const rewritten = treeShakeReferences(context, {
  roots: [nameSchema],
  defsUri: "#/components/schemas"
});

// The result contains only the string definition.
console.log(rewritten.get(nameSchema)); // { $ref: "#/components/schemas/string" }
```

Tree-shaking maintains reference integrity while relocating nodes, ensuring the extracted subset remains valid and self-contained.

## License

MIT © Tool Cognition Inc.
