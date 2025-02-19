import assert from "node:assert/strict";
import { suite, test } from "node:test";
import {
  ResolutionError,
  createContext,
  createResource,
  getResource,
  setResource,
  getResourceAnchor,
  setResourceAnchor,
  resolveResource,
  resolveResourceFragment,
  resolveResourceUri,
} from "tool-json";

void suite("JSON resources", () => {
  void test("creates resource with node and optional URI", () => {
    const node = { test: true };

    const resource1 = createResource(undefined, node);
    assert.equal(resource1.node, node);
    assert.equal(resource1.uri, undefined);
    assert.equal(resource1.anchors, undefined);

    const resource2 = createResource("https://example.com/test.json", node);
    assert.equal(resource2.node, node);
    assert.equal(resource2.uri, "https://example.com/test.json");
    assert.equal(resource2.anchors, undefined);
  });

  void test("registers and retrieves resource by node", () => {
    const context = createContext();
    const node = { test: true };
    const resource = createResource(undefined, node);

    assert.equal(getResource(context, node), undefined);

    setResource(context, resource);
    assert.equal(getResource(context, node), resource);
    assert.equal(getResource(context, { test: true }), undefined); // Different object
  });

  void test("registers and retrieves resource by canonical URI", async () => {
    const context = createContext();
    const node = { test: true };
    const resource = createResource("https://example.com/test.json", node);

    assert.equal(
      await resolveResource(context, "https://example.com/test.json"),
      undefined,
    );

    setResource(context, resource);
    assert.equal(
      await resolveResource(context, "https://example.com/test.json"),
      resource,
    );
    assert.equal(
      await resolveResource(context, "https://example.com/other.json"),
      undefined,
    );
  });

  void test("maintains both node and URI mappings", async () => {
    const context = createContext();
    const node = { test: true };
    const resource = createResource("https://example.com/test.json", node);

    setResource(context, resource);

    // Same resource should be returned from both mappings
    const byNode = getResource(context, node);
    const byUri = await resolveResource(
      context,
      "https://example.com/test.json",
    );
    assert.equal(byNode, resource);
    assert.equal(byUri, resource);
    assert.equal(byNode, byUri);
  });

  void test("handles multiple resources in same context", async () => {
    const context = createContext();
    const node1 = { id: 1 };
    const node2 = { id: 2 };

    const resource1 = createResource("https://example.com/1.json", node1);
    const resource2 = createResource("https://example.com/2.json", node2);

    setResource(context, resource1);
    setResource(context, resource2);

    // Each resource should be independently accessible
    assert.equal(getResource(context, node1), resource1);
    assert.equal(getResource(context, node2), resource2);
    assert.equal(
      await resolveResource(context, "https://example.com/1.json"),
      resource1,
    );
    assert.equal(
      await resolveResource(context, "https://example.com/2.json"),
      resource2,
    );
  });

  void test("handles resources without canonical URIs", async () => {
    const context = createContext();
    const node1 = { id: 1 };
    const node2 = { id: 2 };

    const resource1 = createResource(undefined, node1);
    const resource2 = createResource("https://example.com/test.json", node2);

    setResource(context, resource1);
    setResource(context, resource2);

    // Resource without URI should only be accessible by node
    assert.equal(getResource(context, node1), resource1);
    assert.equal(getResource(context, node2), resource2);
    assert.equal(
      await resolveResource(context, "https://example.com/test.json"),
      resource2,
    );
  });

  void test("allows updating resource mappings", async () => {
    const context = createContext();
    const node = { test: true };

    const resource1 = createResource("https://example.com/test.json", node);
    setResource(context, resource1);

    const resource2 = createResource("https://example.com/test.json", node);
    setResource(context, resource2);

    assert.equal(getResource(context, node), resource2);
    assert.equal(
      await resolveResource(context, "https://example.com/test.json"),
      resource2,
    );
  });

  void test("sets and gets resource anchor", () => {
    const resource = createResource(undefined, {});
    const anchor = { type: "string" };

    assert.equal(getResourceAnchor(resource, "stringType"), undefined);

    setResourceAnchor(resource, "stringType", anchor);
    assert.equal(getResourceAnchor(resource, "stringType"), anchor);
  });

  void test("supports multiple anchors in same resource", () => {
    const resource = createResource(undefined, {});
    const anchor1 = { type: "string" };
    const anchor2 = { type: "number" };
    const anchor3 = { type: "boolean" };

    setResourceAnchor(resource, "stringType", anchor1);
    setResourceAnchor(resource, "numberType", anchor2);
    setResourceAnchor(resource, "booleanType", anchor3);

    assert.equal(getResourceAnchor(resource, "stringType"), anchor1);
    assert.equal(getResourceAnchor(resource, "numberType"), anchor2);
    assert.equal(getResourceAnchor(resource, "booleanType"), anchor3);
  });

  void test("allows updating existing anchors", () => {
    const resource = createResource(undefined, {});
    const anchor1 = { type: "string" };
    const anchor2 = { type: "number" };

    setResourceAnchor(resource, "type", anchor1);
    assert.equal(getResourceAnchor(resource, "type"), anchor1);

    setResourceAnchor(resource, "type", anchor2);
    assert.equal(getResourceAnchor(resource, "type"), anchor2);
  });

  void test("maintains independent anchor sets across resources", () => {
    const resource1 = createResource(undefined, {});
    const resource2 = createResource(undefined, {});

    const anchor1 = { type: "string" };
    const anchor2 = { type: "number" };

    setResourceAnchor(resource1, "type", anchor1);
    setResourceAnchor(resource2, "type", anchor2);

    assert.equal(getResourceAnchor(resource1, "type"), anchor1);
    assert.equal(getResourceAnchor(resource2, "type"), anchor2);
  });

  void test("preserves anchors when resource is registered", async () => {
    const context = createContext();
    const node = {};
    const resource = createResource("https://example.com/test.json", node);
    const anchor = { type: "string" };

    setResourceAnchor(resource, "type", anchor);
    setResource(context, resource);

    const retrieved = await resolveResource(
      context,
      "https://example.com/test.json",
    );
    assert.equal(retrieved, resource);
    assert.equal(getResourceAnchor(retrieved, "type"), anchor);
  });

  void test("handles anchor names with special characters", () => {
    const resource = createResource(undefined, {});
    const anchor = { special: true };

    // Test various special characters that might appear in anchor names
    const names = [
      "with space",
      "with/slash",
      "with#hash",
      "with?query",
      "with:colon",
      "with@at",
      "-with-dashes-",
      "_with_underscores_",
      "with.dots",
      "with$dollar",
    ];

    for (const name of names) {
      setResourceAnchor(resource, name, anchor);
      assert.equal(getResourceAnchor(resource, name), anchor);
    }
  });

  void test("maintains anchors when canonical URI is present", () => {
    const resource = createResource("https://example.com/test.json", {});
    const anchor = { type: "string" };

    setResourceAnchor(resource, "type", anchor);
    assert.equal(resource.uri, "https://example.com/test.json");
    assert.equal(getResourceAnchor(resource, "type"), anchor);
  });

  void test("returns resource node for empty fragment", () => {
    const context = createContext();
    const node = { test: true };
    const resource = createResource(undefined, node);

    const result = resolveResourceFragment(context, resource, "");
    assert.equal(result, node);
  });

  void test("resolves JSON Pointer fragments", () => {
    const context = createContext();
    const node = {
      string: "test",
      number: 123,
      object: { nested: true },
      array: [1, 2, 3],
    };
    const resource = createResource(undefined, node);

    assert.equal(resolveResourceFragment(context, resource, "/string"), "test");
    assert.equal(resolveResourceFragment(context, resource, "/number"), 123);
    assert.equal(
      resolveResourceFragment(context, resource, "/object/nested"),
      true,
    );
    assert.equal(resolveResourceFragment(context, resource, "/array/1"), 2);
  });

  void test("resolves anchor name fragments", () => {
    const context = createContext();
    const node = {};
    const resource = createResource(undefined, node);

    const stringType = { type: "string" };
    const numberType = { type: "number" };

    setResourceAnchor(resource, "stringType", stringType);
    setResourceAnchor(resource, "numberType", numberType);

    assert.equal(
      resolveResourceFragment(context, resource, "stringType"),
      stringType,
    );
    assert.equal(
      resolveResourceFragment(context, resource, "numberType"),
      numberType,
    );
  });

  void test("throws for invalid JSON Pointer fragments", () => {
    const context = createContext();
    const node = { test: true };
    const resource = createResource(undefined, node);

    assert.throws(
      () => resolveResourceFragment(context, resource, "/missing"),
      ResolutionError,
    );

    assert.throws(
      () => resolveResourceFragment(context, resource, "/test/nested"),
      ResolutionError,
    );
  });

  void test("throws for missing anchor fragments", () => {
    const context = createContext();
    const node = {};
    const resource = createResource(undefined, node);

    assert.throws(
      () => resolveResourceFragment(context, resource, "missing"),
      ResolutionError,
    );
  });

  void test("resolves complex pointer paths", () => {
    const context = createContext();
    const node = {
      $defs: {
        person: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
        },
      },
      items: [{ $ref: "#/$defs/person" }, { type: "string" }],
    };
    const resource = createResource(undefined, node);

    const result = resolveResourceFragment(
      context,
      resource,
      "/$defs/person/properties/name",
    );
    assert.deepEqual(result, { type: "string" });
  });

  void test("handles special characters in pointer paths", () => {
    const context = createContext();
    const node = {
      "with~tilde": { "with/slash": true },
    };
    const resource = createResource(undefined, node);

    const result = resolveResourceFragment(
      context,
      resource,
      "/with~0tilde/with~1slash",
    );
    assert.equal(result, true);
  });

  void test("resolves canonical URIs", async () => {
    const context = createContext();
    const node = { test: true };
    const resource = createResource("https://example.com/schema.json", node);
    setResource(context, resource);

    const result = await resolveResourceUri(
      context,
      undefined,
      "https://example.com/schema.json",
    );
    assert.equal(result, node);
  });

  void test("resolves canonical URIs with pointer fragments", async () => {
    const context = createContext();
    const node = {
      $defs: {
        string: { type: "string" },
        number: { type: "number" },
      },
    };
    const resource = createResource("https://example.com/types.json", node);
    setResource(context, resource);

    const result = await resolveResourceUri(
      context,
      undefined,
      "https://example.com/types.json#/$defs/string",
    );
    assert.deepEqual(result, { type: "string" });
  });

  void test("resolves canonical URIs with anchor fragments", async () => {
    const context = createContext();
    const node = {
      $defs: {
        string: { type: "string" },
      },
    };
    const resource = createResource("https://example.com/anchors.json", node);
    const stringType = { type: "string", format: "basic" };
    setResourceAnchor(resource, "basic-string", stringType);
    setResource(context, resource);

    const result = await resolveResourceUri(
      context,
      undefined,
      "https://example.com/anchors.json#basic-string",
    );
    assert.equal(result, stringType);
  });

  void test("resolves relative URI references", async () => {
    const context = createContext();
    const baseNode = {};
    const baseResource = createResource(undefined, baseNode);

    const targetNode = { type: "string" };
    const targetResource = createResource(
      "https://example.com/string.json",
      targetNode,
    );
    setResource(context, targetResource);

    const result = await resolveResourceUri(
      context,
      baseResource,
      "https://example.com/string.json",
    );
    assert.equal(result, targetNode);
  });

  void test("resolves empty fragment against base resource", async () => {
    const context = createContext();
    const node = { type: "string" };
    const resource = createResource(undefined, node);

    const result = await resolveResourceUri(context, resource, "#");
    assert.equal(result, node);
  });

  void test("throws for unknown canonical URIs", async () => {
    const context = createContext();

    await assert.rejects(async () => {
      await resolveResourceUri(
        context,
        undefined,
        "https://example.com/missing.json",
      );
    }, ResolutionError);
  });

  void test("throws for relative URIs without base", async () => {
    const context = createContext();

    await assert.rejects(async () => {
      await resolveResourceUri(context, undefined, "#/missing");
    }, ResolutionError);
  });

  void test("handles mixed pointer and anchor fragments", async () => {
    const context = createContext();
    const node = {
      $defs: {
        user: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      },
    };

    const resource = createResource("https://example.com/schema.json", node);
    const emailType = { type: "string", format: "email" };
    setResourceAnchor(resource, "email", emailType);
    setResource(context, resource);

    // Test pointer resolution
    const nameType = await resolveResourceUri(
      context,
      undefined,
      "https://example.com/schema.json#/$defs/user/properties/name",
    );
    assert.deepEqual(nameType, { type: "string" });

    // Test anchor resolution in same resource
    const email = await resolveResourceUri(
      context,
      undefined,
      "https://example.com/schema.json#email",
    );
    assert.equal(email, emailType);
  });

  void test("loads dynamic resources synchronously", async () => {
    const context = createContext({
      resolveResource: (uri) => {
        if (uri === "https://example.com/dynamic.json") {
          return createResource(uri, targetNode);
        }
        return undefined;
      },
    });
    const targetNode = { type: "string" };

    const resource = await resolveResource(
      context,
      "https://example.com/dynamic.json",
    );
    assert.notEqual(resource, undefined);
    assert.equal(resource?.node, targetNode);
    assert.equal(resource?.uri, "https://example.com/dynamic.json");
  });

  void test("loads dynamic resources asynchronously", async () => {
    const context = createContext({
      resolveResource: async (uri) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (uri === "https://example.com/async.json") {
              resolve(createResource(uri, targetNode));
            } else {
              resolve(undefined);
            }
          });
        });
      },
    });
    const targetNode = { type: "number" };

    const resource = await resolveResource(
      context,
      "https://example.com/async.json",
    );
    assert.notEqual(resource, undefined);
    assert.equal(resource?.node, targetNode);
    assert.equal(resource?.uri, "https://example.com/async.json");
  });

  void test("loads undefined dynamic resources", async () => {
    const context = createContext({
      resolveResource: () => undefined,
    });

    const resource = await resolveResource(
      context,
      "https://example.com/nonexistent.json",
    );
    assert.equal(resource, undefined);
  });

  void test("propagates dynamic resource loading errors", async () => {
    const context = createContext({
      resolveResource: (uri) => {
        throw new Error("Failed to load resource: " + JSON.stringify(uri));
      },
    });

    await assert.rejects(async () => {
      await resolveResource(context, "https://example.com/error.json");
    }, Error);
  });

  void test("propagates dynamic resource loading rejections", async () => {
    const context = createContext({
      resolveResource: (uri) => {
        return Promise.reject(
          new Error("Failed to load resource: " + JSON.stringify(uri)),
        );
      },
    });

    await assert.rejects(async () => {
      await resolveResource(context, "https://example.com/error.json");
    }, Error);
  });

  void test("resolves fragments in dynamically loaded resources", async () => {
    const context = createContext({
      resolveResource: (uri) => {
        if (uri === "https://example.com/types.json") {
          const resource = createResource(uri, targetNode);
          setResourceAnchor(resource, "anchor", { format: "special" });
          return resource;
        }
        return undefined;
      },
    });
    const targetNode = {
      $defs: {
        string: { type: "string" },
        number: { type: "number" },
      },
    };

    // Resolve with pointer fragment
    const stringType = await resolveResourceUri(
      context,
      undefined,
      "https://example.com/types.json#/$defs/string",
    );
    assert.deepEqual(stringType, { type: "string" });

    // Resolve with anchor fragment
    const anchorType = await resolveResourceUri(
      context,
      undefined,
      "https://example.com/types.json#anchor",
    );
    assert.deepEqual(anchorType, { format: "special" });
  });
});
