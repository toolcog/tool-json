import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { UriError } from "tool-uri";
import {
  ResolutionError,
  isObject,
  createContext,
  nestFrame,
  createResource,
  setResource,
  createReference,
  getReference,
  registerReference,
  resolveReferences,
  detectReference,
  detectReferences,
  treeShakeReferences,
} from "tool-json";

void suite("JSON references", () => {
  void test("creates reference with URI", () => {
    const reference = createReference(
      "$ref",
      "https://example.com/schema.json#/$defs/type",
    );

    assert.equal(reference.uri, "https://example.com/schema.json#/$defs/type");
    assert.equal(reference.target, undefined);
  });

  void test("registers and retrieves reference by node", () => {
    const context = createContext();
    const node = { $ref: "https://example.com/schema.json" };

    assert.equal(getReference(context, node), undefined);

    const reference = registerReference(
      context,
      node,
      "$ref",
      "https://example.com/schema.json",
    );
    assert.equal(getReference(context, node), reference);
    assert.equal(
      getReference(context, { $ref: "https://example.com/schema.json" }),
      undefined,
    ); // Different object
  });

  void test("tracks unresolved references", () => {
    const context = createContext();
    const node = { $ref: "https://example.com/schema.json" };

    const reference = registerReference(
      context,
      node,
      "$ref",
      "https://example.com/schema.json",
    );

    // Reference should be in both maps
    assert.equal(context.references?.get(node), reference);
    assert.equal(context.unresolved?.get(node), reference);
  });

  void test("returns existing reference if already registered", () => {
    const context = createContext();
    const node = { $ref: "https://example.com/schema.json" };

    const reference1 = registerReference(
      context,
      node,
      "$ref",
      "https://example.com/schema.json",
    );
    const reference2 = registerReference(
      context,
      node,
      "$ref",
      "https://example.com/schema.json",
    );

    assert.equal(reference2, reference1);
    assert.equal(context.unresolved?.size, 1);
  });

  void test("maintains references across multiple nodes", () => {
    const context = createContext();
    const node1 = { $ref: "https://example.com/schema1.json" };
    const node2 = { $ref: "https://example.com/schema2.json" };

    const reference1 = registerReference(
      context,
      node1,
      "$ref",
      "https://example.com/schema1.json",
    );
    const reference2 = registerReference(
      context,
      node2,
      "$ref",
      "https://example.com/schema2.json",
    );

    assert.equal(getReference(context, node1), reference1);
    assert.equal(getReference(context, node2), reference2);
    assert.equal(context.unresolved?.size, 2);
  });

  void test("preserves references when target resource exists", () => {
    const context = createContext();
    const targetNode = { type: "string" };
    const resource = createResource(
      "https://example.com/string.json",
      targetNode,
    );
    setResource(context, resource);

    const refNode = { $ref: "https://example.com/string.json" };
    const reference = registerReference(
      context,
      refNode,
      "$ref",
      "https://example.com/string.json",
    );

    assert.equal(getReference(context, refNode), reference);
    assert.equal(reference.target, undefined); // Still unresolved until explicitly resolved
  });

  void test("uses WeakMap for node-to-reference mapping", () => {
    const context = createContext();
    const node = { $ref: "https://example.com/schema.json" };

    registerReference(context, node, "$ref", "https://example.com/schema.json");

    assert(context.references instanceof WeakMap);
    assert(context.unresolved instanceof Map); // Regular Map for unresolved tracking
  });

  void test("detects reference in single node", () => {
    const context = createContext();
    const node = { $ref: "https://example.com/schema.json" };

    const reference = detectReference(context, node);
    assert.notEqual(reference, undefined);
    assert.equal(reference?.uri, "https://example.com/schema.json");
    assert.equal(getReference(context, node), reference);
  });

  void test("resolves reference URI against base URI", () => {
    const context = createContext();
    const node = { $ref: "types.json" };

    nestFrame(context, (frame) => {
      frame.baseUri = "https://example.com/schemas/";
      const reference = detectReference(context, node);
      assert.equal(reference?.uri, "https://example.com/schemas/types.json");
    });
  });

  void test("detects references with custom keyword", () => {
    const context = createContext();
    const node = { $schema: "https://example.com/schema.json" };

    const reference = detectReference(context, node, "$schema");
    assert.equal(reference?.uri, "https://example.com/schema.json");
  });

  void test("ignores non-string reference values", () => {
    const context = createContext();
    const nodes = [
      { $ref: 123 },
      { $ref: true },
      { $ref: null },
      { $ref: { uri: "https://example.com/schema.json" } },
      { $ref: ["https://example.com/schema.json"] },
    ];

    for (const node of nodes) {
      const reference = detectReference(context, node);
      assert.equal(reference, undefined);
      assert.equal(getReference(context, node), undefined);
    }
  });

  void test("detects nested references", () => {
    const context = createContext();
    const node = {
      type: "object",
      properties: {
        name: { $ref: "string.json" },
        address: {
          type: "object",
          properties: {
            street: { $ref: "string.json" },
            city: { $ref: "string.json" },
          },
        },
      },
    };

    nestFrame(context, (frame) => {
      frame.baseUri = "https://example.com/schemas/";
      detectReferences(context, node);
    });

    // Should find all three references
    assert.equal(context.unresolved?.size, 3);
    assert.notEqual(getReference(context, node.properties.name), undefined);
    assert.notEqual(
      getReference(context, node.properties.address.properties.street),
      undefined,
    );
    assert.notEqual(
      getReference(context, node.properties.address.properties.city),
      undefined,
    );
  });

  void test("detects references in arrays", () => {
    const context = createContext();
    const node = {
      type: "array",
      items: [
        { $ref: "string.json" },
        { $ref: "number.json" },
        { type: "boolean" },
      ],
    };

    nestFrame(context, (frame) => {
      frame.baseUri = "https://example.com/schemas/";
      detectReferences(context, node);
    });

    assert.equal(context.unresolved?.size, 2);
    assert.notEqual(getReference(context, node.items[0]), undefined);
    assert.notEqual(getReference(context, node.items[1]), undefined);
    assert.equal(getReference(context, node.items[2]), undefined);
  });

  void test("throws UriError for invalid base URI", () => {
    const context = createContext();
    const node = { $ref: "types.json" };

    nestFrame(context, (frame) => {
      frame.baseUri = "http://example.com:port"; // Invalid port
      assert.throws(() => detectReference(context, node), UriError);
    });
  });

  void test("throws UriError for invalid reference URI", () => {
    const context = createContext();
    const node = { $ref: "http://example.com:port" }; // Invalid port

    assert.throws(() => detectReference(context, node), UriError);
  });

  void test("throws UriError for invalid relative reference", () => {
    const context = createContext();
    const node = { $ref: "http://example.com:port" }; // Invalid port

    assert.throws(() => detectReference(context, node), UriError);
  });

  void test("resolves reference to resource node", async () => {
    const context = createContext();
    const targetNode = { type: "string" };
    const resource = createResource(
      "https://example.com/string.json",
      targetNode,
    );
    setResource(context, resource);

    const refNode = { $ref: "https://example.com/string.json" };
    const reference = registerReference(
      context,
      refNode,
      "$ref",
      "https://example.com/string.json",
    );

    await resolveReferences(context, undefined);
    assert.equal(reference.target, targetNode);
    assert.equal(context.unresolved?.size, 0);
  });

  void test("resolves reference with fragment", async () => {
    const context = createContext();
    const targetNode = {
      $defs: {
        string: { type: "string" },
      },
    };
    const resource = createResource(
      "https://example.com/types.json",
      targetNode,
    );
    setResource(context, resource);

    const refNode = { $ref: "https://example.com/types.json#/$defs/string" };
    const reference = registerReference(
      context,
      refNode,
      "$ref",
      "https://example.com/types.json#/$defs/string",
    );

    await resolveReferences(context, undefined);
    assert.deepEqual(reference.target, { type: "string" });
  });

  void test("resolves multiple references", async () => {
    const context = createContext();
    const stringType = { type: "string" };
    const numberType = { type: "number" };

    const types = createResource("https://example.com/types.json", {
      string: stringType,
      number: numberType,
    });
    setResource(context, types);

    const ref1 = { $ref: "https://example.com/types.json#/string" };
    const ref2 = { $ref: "https://example.com/types.json#/number" };

    const reference1 = registerReference(
      context,
      ref1,
      "$ref",
      "https://example.com/types.json#/string",
    );
    const reference2 = registerReference(
      context,
      ref2,
      "$ref",
      "https://example.com/types.json#/number",
    );

    await resolveReferences(context, undefined);
    assert.equal(reference1.target, stringType);
    assert.equal(reference2.target, numberType);
    assert.equal(context.unresolved?.size, 0);
  });

  void test("throws for unknown resource", async () => {
    const context = createContext();
    const refNode = { $ref: "https://example.com/missing.json" };
    registerReference(
      context,
      refNode,
      "$ref",
      "https://example.com/missing.json",
    );

    await assert.rejects(async () => {
      await resolveReferences(context, undefined);
    }, ResolutionError);

    assert.equal(context.unresolved?.size, 0); // Still clears unresolved refs
  });

  void test("throws for invalid fragment", async () => {
    const context = createContext();
    const resource = createResource("https://example.com/types.json", {});
    setResource(context, resource);

    const refNode = { $ref: "https://example.com/types.json#/missing" };
    registerReference(
      context,
      refNode,
      "$ref",
      "https://example.com/types.json#/missing",
    );

    await assert.rejects(async () => {
      await resolveReferences(context, undefined);
    }, ResolutionError);
  });

  void test("aggregates multiple resolution errors", async () => {
    const context = createContext();

    const ref1 = { $ref: "https://example.com/missing1.json" };
    const ref2 = { $ref: "https://example.com/missing2.json" };

    registerReference(
      context,
      ref1,
      "$ref",
      "https://example.com/missing1.json",
    );
    registerReference(
      context,
      ref2,
      "$ref",
      "https://example.com/missing2.json",
    );

    let error: ResolutionError | undefined;
    try {
      await resolveReferences(context, undefined);
    } catch (cause) {
      error = cause as ResolutionError;
    }

    assert(error instanceof ResolutionError);
    assert(error.message.includes("multiple references"));
    assert.equal((error.cause as ResolutionError[]).length, 2);
    assert((error.cause as ResolutionError[])[0] instanceof ResolutionError);
    assert((error.cause as ResolutionError[])[1] instanceof ResolutionError);
  });

  void test("resolves references relative to base resource", async () => {
    const context = createContext();
    const baseNode = { type: "object" };
    const baseResource = createResource(undefined, baseNode);

    const targetNode = { type: "string" };
    const targetResource = createResource(
      "https://example.com/string.json",
      targetNode,
    );
    setResource(context, targetResource);

    const refNode = { $ref: "https://example.com/string.json" };
    const reference = registerReference(
      context,
      refNode,
      "$ref",
      "https://example.com/string.json",
    );

    await resolveReferences(context, baseResource);
    assert.equal(reference.target, targetNode);
  });

  void test("handles empty unresolved map", async () => {
    const context = createContext();
    const resource = createResource(undefined, {});

    // Should not throw
    await resolveReferences(context, resource);
  });

  void test("relocates single reference", async () => {
    const context = createContext();

    // Set up the target resource.
    const targetNode = { type: "string" };
    const resource = createResource(
      "https://example.com/string.json",
      targetNode,
    );
    setResource(context, resource);

    // Create and resolve the reference.
    const refNode = { $ref: "https://example.com/string.json" };
    registerReference(
      context,
      refNode,
      "$ref",
      "https://example.com/string.json",
    );
    await resolveReferences(context, undefined);

    const result = treeShakeReferences(context, {
      roots: [refNode],
      defsUri: "#/components/schemas",
    });
    assert.deepEqual(result, {
      roots: [{ $ref: "#/components/schemas/string.json" }],
      defs: {
        "string.json": { type: "string" },
      },
    });
  });

  void test("preserves root nodes", async () => {
    const context = createContext();

    // Create a root schema with an internal reference.
    const rootNode = {
      type: "object",
      properties: {
        name: { $ref: "#/$defs/string" },
      },
      $defs: {
        string: { type: "string" },
      },
    };

    // Register and resolve the reference.
    registerReference(
      context,
      rootNode.properties.name,
      "$ref",
      "#/$defs/string",
    );
    await resolveReferences(context, createResource(undefined, rootNode));

    const result = treeShakeReferences(context, {
      roots: [rootNode],
      defsUri: "#/components/schemas",
    });

    assert.deepEqual(result, {
      roots: [
        {
          type: "object",
          properties: {
            name: { $ref: "#/components/schemas/string" },
          },
          $defs: {
            string: { type: "string" },
          },
        },
      ],
      defs: {
        string: { type: "string" },
      },
    });
  });

  void test("handles shared references", async () => {
    const context = createContext();

    // Create a schema with multiple references to the same target.
    const targetNode = { type: "string" };
    const ref1Node = { $ref: "#/$defs/string" };
    const ref2Node = { $ref: "#/$defs/string" };
    const rootNode = {
      $defs: { string: targetNode },
      properties: {
        prop1: ref1Node,
        prop2: ref2Node,
      },
    };

    // Register and resolve the references.
    registerReference(context, ref1Node, "$ref", "#/$defs/string");
    registerReference(context, ref2Node, "$ref", "#/$defs/string");
    await resolveReferences(context, createResource(undefined, rootNode));

    const result = treeShakeReferences(context, {
      roots: [rootNode],
      defsUri: "#/components/schemas",
    });

    assert.deepEqual(result, {
      roots: [
        {
          $defs: { string: { type: "string" } },
          properties: {
            prop1: { $ref: "#/components/schemas/string" },
            prop2: { $ref: "#/components/schemas/string" },
          },
        },
      ],
      defs: {
        string: { type: "string" },
      },
    });
  });

  void test("handles cyclic references", async () => {
    const context = createContext();

    const personNode = {
      type: "object",
      properties: {
        name: { type: "string" },
        friend: { $ref: "#/$defs/person" },
      },
    };

    const rootNode = {
      $defs: { person: personNode },
    };

    // Register and resolve the self-reference.
    registerReference(
      context,
      personNode.properties.friend,
      "$ref",
      "#/$defs/person",
    );
    await resolveReferences(context, createResource(undefined, rootNode));

    const result = treeShakeReferences(context, {
      roots: [rootNode],
      defsUri: "#/components/schemas",
    });

    assert.deepEqual(result, {
      roots: [
        {
          $defs: {
            person: {
              type: "object",
              properties: {
                name: { type: "string" },
                friend: { $ref: "#/components/schemas/person" },
              },
            },
          },
        },
      ],
      defs: {
        person: {
          type: "object",
          properties: {
            name: { type: "string" },
            friend: { $ref: "#/components/schemas/person" },
          },
        },
      },
    });
  });

  void test("applies transformations during rewriting", async () => {
    const context = createContext();

    const stringType = { type: "string" };
    const refNode = { $ref: "#/$defs/string" };
    const rootNode = {
      $defs: { string: stringType },
      properties: { name: refNode },
    };

    registerReference(context, refNode, "$ref", "#/$defs/string");
    await resolveReferences(context, createResource(undefined, rootNode));

    const result = treeShakeReferences(context, {
      roots: [rootNode],
      defsUri: "#/components/schemas",
      transform: (node) => {
        if (isObject(node) && "type" in node) {
          return { ...node, description: "Added by transform" };
        }
        return node;
      },
    });

    assert.deepEqual(result, {
      roots: [
        {
          $defs: {
            string: {
              type: "string",
              description: "Added by transform",
            },
          },
          properties: {
            name: { $ref: "#/components/schemas/string" },
          },
        },
      ],
      defs: {
        string: {
          type: "string",
          description: "Added by transform",
        },
      },
    });
  });

  void test("applies transformations to nested structures", () => {
    const context = createContext();
    const rootNode = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: {
            deep: { type: "string" },
          },
        },
      },
    };

    const result = treeShakeReferences(context, {
      roots: [rootNode],
      defsUri: "#/components/schemas",
      transform: (node) => {
        if (isObject(node) && "type" in node) {
          return { ...node, transformed: true };
        }
        return node;
      },
    });

    assert.deepEqual(result, {
      roots: [
        {
          type: "object",
          transformed: true,
          properties: {
            nested: {
              type: "object",
              transformed: true,
              properties: {
                deep: { type: "string", transformed: true },
              },
            },
          },
        },
      ],
      defs: undefined,
    });
  });

  void test("handles reference chains", async () => {
    const context = createContext();

    const nodeC = { type: "string" };
    const nodeB = { $ref: "#/$defs/c" };
    const nodeA = { $ref: "#/$defs/b" };
    const rootNode = {
      $defs: {
        a: nodeA,
        b: nodeB,
        c: nodeC,
      },
    };

    registerReference(context, nodeA, "$ref", "#/$defs/b");
    registerReference(context, nodeB, "$ref", "#/$defs/c");
    await resolveReferences(context, createResource(undefined, rootNode));

    const result = treeShakeReferences(context, {
      roots: [rootNode],
      defsUri: "#/components/schemas",
    });

    assert.deepEqual(result, {
      roots: [
        {
          $defs: {
            a: { $ref: "#/components/schemas/b" },
            b: { $ref: "#/components/schemas/c" },
            c: { type: "string" },
          },
        },
      ],
      defs: {
        b: { $ref: "#/components/schemas/c" },
        c: { type: "string" },
      },
    });
  });

  void test("handles empty reference targets", async () => {
    const context = createContext();
    const emptyNode = {};
    const refNode = { $ref: "#/empty" };
    const rootNode = {
      empty: emptyNode,
      ref: refNode,
    };

    registerReference(context, refNode, "$ref", "#/empty");
    await resolveReferences(context, createResource(undefined, rootNode));

    const result = treeShakeReferences(context, {
      roots: [rootNode],
      defsUri: "#/components/schemas",
    });

    assert.deepEqual(result, {
      roots: [
        {
          empty: {},
          ref: { $ref: "#/components/schemas/empty" },
        },
      ],
      defs: {
        empty: {},
      },
    });
  });

  void test("handles multiple root nodes", async () => {
    const context = createContext();

    const sharedTarget = { type: "string" };
    const root1 = { $ref: "#/target" };
    const root2 = { $ref: "#/target" };
    const container = {
      target: sharedTarget,
      ref1: root1,
      ref2: root2,
    };

    registerReference(context, root1, "$ref", "#/target");
    registerReference(context, root2, "$ref", "#/target");
    await resolveReferences(context, createResource(undefined, container));

    const result = treeShakeReferences(context, {
      roots: [root1, root2],
      defsUri: "#/components/schemas",
    });

    assert.deepEqual(result, {
      roots: [
        { $ref: "#/components/schemas/target" },
        { $ref: "#/components/schemas/target" },
      ],
      defs: {
        target: { type: "string" },
      },
    });
  });
});
