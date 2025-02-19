import assert from "node:assert/strict";
import { suite, test } from "node:test";
import type { Frame } from "tool-json";
import {
  createContext,
  createFrame,
  pushFrame,
  popFrame,
  nestFrame,
  currentBaseUri,
  currentPath,
  currentPointer,
  currentLocation,
  createResource,
  setResource,
} from "tool-json";

void suite("Context stack", () => {
  void test("begins with an empty stack", () => {
    const context = createContext();
    assert.equal(context.stack, undefined);
  });

  void test("pushes frames with undefined properties", () => {
    const context = createContext();
    const frame = pushFrame(context);

    assert.equal(frame.parent, undefined);
    assert.equal(frame.baseUri, undefined);
    assert.equal(frame.nodeKey, undefined);
    assert.equal(frame.node, undefined);
    assert.equal(context.stack, frame);
  });

  void test("links parent when pushing frames", () => {
    const context = createContext();
    const frame1 = pushFrame(context);
    const frame2 = pushFrame(context);

    assert.equal(frame2.parent, frame1);
    assert.equal(frame1.parent, undefined);
    assert.equal(context.stack, frame2);
  });

  void test("pops frames in order", () => {
    const context = createContext();
    const frame1 = pushFrame(context);
    const frame2 = pushFrame(context);

    const popped = popFrame(context);
    assert.equal(popped, frame2);
    assert.equal(context.stack, frame1);

    const popped2 = popFrame(context);
    assert.equal(popped2, frame1);
    assert.equal(context.stack, undefined);
  });

  void test("executes nested frame functions", () => {
    const context = createContext();
    const frame1 = pushFrame(context);

    const result = nestFrame(context, (frame2) => {
      assert.equal(frame2.parent, frame1);
      assert.equal(context.stack, frame2);
      return "test-result";
    });

    assert.equal(result, "test-result");
    assert.equal(context.stack, frame1);
  });

  void test("executes async nested frame functions", async () => {
    const context = createContext();
    const frame1 = pushFrame(context);

    const result = await nestFrame(context, (frame2) => {
      assert.equal(frame2.parent, frame1);
      assert.equal(context.stack, frame2);
      return Promise.resolve("test-result");
    });

    assert.equal(result, "test-result");
    assert.equal(context.stack, frame1);
  });

  void test("propagates errors in nested frames", () => {
    const context = createContext();
    const frame1 = pushFrame(context);

    assert.throws(() => {
      nestFrame(context, () => {
        throw new Error("test error");
      });
    }, Error);

    assert.equal(context.stack, frame1);
  });

  void test("propagates rejections in async nested frames", async () => {
    const context = createContext();
    const frame1 = pushFrame(context);

    await assert.rejects(async () => {
      await nestFrame(context, () => {
        return Promise.reject(new Error("test rejection"));
      });
    }, Error);

    assert.equal(context.stack, frame1);
  });

  void test("detects stack corruption in nested frames", () => {
    const context = createContext();
    pushFrame(context);

    assert.throws(
      () => {
        nestFrame(context, (frame) => {
          context.stack = undefined;
          return "result";
        });
      },
      Error,
      "Stack frame was replaced during execution",
    );
  });

  void test("detects stack corruption in async nested frames", async () => {
    const context = createContext();
    pushFrame(context);

    await assert.rejects(
      async () => {
        await nestFrame(context, async (frame) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          context.stack = undefined;
          return "corrupted-result";
        });
      },
      Error,
      "Stack frame was replaced during execution",
    );
  });

  void test("supports custom frame types", () => {
    interface CustomFrame extends Frame {
      custom?: string;
    }

    const context = createContext();
    context.createFrame = (parent?: Frame): CustomFrame => ({
      ...createFrame(parent),
      custom: "custom-value",
    });

    const result = nestFrame(context, (frame: CustomFrame) => {
      assert.equal(frame.custom, "custom-value");
      return frame.custom;
    });

    assert.equal(result, "custom-value");
  });

  void test("preserves nested frame state", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.nodeKey = "level1";

      nestFrame(context, (frame2) => {
        frame2.nodeKey = "level2";

        nestFrame(context, (frame3) => {
          frame3.nodeKey = "level3";

          // Verify the full stack at deepest nesting
          let current = frame3;
          assert.equal(current.nodeKey, "level3");
          current = current.parent!;
          assert.equal(current.nodeKey, "level2");
          current = current.parent!;
          assert.equal(current.nodeKey, "level1");
          assert.equal(current.parent, undefined);
        });

        // Verify we're back at level2
        assert.equal(context.stack, frame2);
        assert.equal(context.stack?.nodeKey, "level2");
      });

      // Verify we're back at level1
      assert.equal(context.stack, frame1);
      assert.equal(context.stack?.nodeKey, "level1");
    });

    // Verify we're back at root
    assert.equal(context.stack, undefined);
  });

  void test("preserves async nested frame state", async () => {
    const context = createContext();

    await nestFrame(context, async (frame1) => {
      frame1.nodeKey = "async-outer";

      await nestFrame(context, async (frame2) => {
        frame2.nodeKey = "async-inner";
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Inner frame should be current during async operation
        assert.equal(context.stack, frame2);
        assert.equal(frame2.nodeKey, "async-inner");
      });

      // Outer frame should be restored after inner async operation
      assert.equal(context.stack, frame1);
      assert.equal(frame1.nodeKey, "async-outer");
    });

    // Stack should be empty after all async operations
    assert.equal(context.stack, undefined);
  });

  void test("isolates nested frame state", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.nodeKey = "outer";
      frame1.node = { outer: true };

      nestFrame(context, (frame2) => {
        frame2.nodeKey = "inner";
        frame2.node = { inner: true };

        // Inner frame shouldn't affect outer frame
        assert.equal(frame1.nodeKey, "outer");
        assert.deepEqual(frame1.node, { outer: true });
      });

      // Outer frame should be unchanged after inner frame
      assert.equal(frame1.nodeKey, "outer");
      assert.deepEqual(frame1.node, { outer: true });
    });
  });

  void test("maintains frame state after deep errors", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.nodeKey = "outer";

      nestFrame(context, (frame2) => {
        frame2.nodeKey = "middle";

        assert.throws(() => {
          nestFrame(context, (frame3) => {
            frame3.nodeKey = "inner";
            throw new Error("deep error");
          });
        }, Error);

        // Middle frame should be preserved after inner error
        assert.equal(context.stack, frame2);
        assert.equal(frame2.nodeKey, "middle");
      });

      // Outer frame should be preserved after middle frame
      assert.equal(context.stack, frame1);
      assert.equal(frame1.nodeKey, "outer");
    });

    // Stack should be empty after all frames complete
    assert.equal(context.stack, undefined);
  });

  void test("preserves frame state after deep async errors", async () => {
    const context = createContext();

    await nestFrame(context, async (frame1) => {
      frame1.nodeKey = "async-outer";

      await assert.rejects(async () => {
        await nestFrame(context, async (frame2) => {
          frame2.nodeKey = "async-middle";

          await nestFrame(context, async (frame3) => {
            frame3.nodeKey = "async-inner";
            await new Promise((resolve) => setTimeout(resolve, 5));
            throw new Error("deep async error");
          });
        });
      }, Error);

      // Outer frame should be preserved after inner async errors
      assert.equal(context.stack, frame1);
      assert.equal(frame1.nodeKey, "async-outer");
    });

    // Stack should be empty after all frames complete
    assert.equal(context.stack, undefined);
  });

  void test("supports mixed sync and async nested frames", async () => {
    const context = createContext();

    await nestFrame(context, async (frame1) => {
      frame1.nodeKey = "async-1";

      // Sync frame nested in async frame
      nestFrame(context, (frame2) => {
        frame2.nodeKey = "sync-2";
        assert.equal(context.stack, frame2);
      });

      // Second async frame nested in first async frame
      await nestFrame(context, async (frame3) => {
        frame3.nodeKey = "async-3";
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Sync frame nested in second async frame
        nestFrame(context, (frame4) => {
          frame4.nodeKey = "sync-4";
          assert.equal(context.stack, frame4);
        });

        assert.equal(context.stack, frame3);
      });

      assert.equal(context.stack, frame1);
    });

    assert.equal(context.stack, undefined);
  });

  void test("inherits base URI", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.baseUri = "https://example.com/base1";
      assert.equal(currentBaseUri(context), "https://example.com/base1");

      nestFrame(context, (frame2) => {
        assert.equal(currentBaseUri(context), "https://example.com/base1");

        nestFrame(context, (frame3) => {
          frame3.baseUri = "https://example.com/base2";
          assert.equal(currentBaseUri(context), "https://example.com/base2");
        });

        assert.equal(currentBaseUri(context), "https://example.com/base1");
      });
    });
  });
});

void suite("Context path", () => {
  void test("returns empty path for empty stacks", () => {
    const context = createContext();
    assert.deepEqual(currentPath(context), []);
  });

  void test("builds path from frame keys", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.nodeKey = "root";
      assert.deepEqual(currentPath(context), ["root"]);

      nestFrame(context, (frame2) => {
        frame2.nodeKey = "nested";
        assert.deepEqual(currentPath(context), ["root", "nested"]);

        nestFrame(context, (frame3) => {
          frame3.nodeKey = 0; // numeric index
          assert.deepEqual(currentPath(context), ["root", "nested", 0]);
        });
      });
    });
  });

  void test("ignores frames without keys", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.nodeKey = "root";

      nestFrame(context, (frame2) => {
        // frame2 has no key
        nestFrame(context, (frame3) => {
          frame3.nodeKey = "leaf";
          assert.deepEqual(currentPath(context), ["root", "leaf"]);
        });
      });
    });
  });

  void test("handles mixed string and number keys", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.nodeKey = "array";

      nestFrame(context, (frame2) => {
        frame2.nodeKey = 0;

        nestFrame(context, (frame3) => {
          frame3.nodeKey = "property";
          assert.deepEqual(currentPath(context), ["array", 0, "property"]);
        });
      });
    });
  });
});

void suite("Context pointer", () => {
  void test("returns empty pointer for empty stack", () => {
    const context = createContext();
    assert.equal(currentPointer(context), "");
  });

  void test("builds pointer path from frame keys", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.nodeKey = "root";

      nestFrame(context, (frame2) => {
        frame2.nodeKey = "nested";

        nestFrame(context, (frame3) => {
          frame3.nodeKey = "deep";
          assert.equal(currentPointer(context), "/root/nested/deep");
        });
      });
    });
  });

  void test("handles mixed string and number keys", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.nodeKey = "array";

      nestFrame(context, (frame2) => {
        frame2.nodeKey = 0;

        nestFrame(context, (frame3) => {
          frame3.nodeKey = "property";
          assert.equal(currentPointer(context), "/array/0/property");
        });
      });
    });
  });

  void test("escapes special characters in pointers", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.nodeKey = "with/slash";

      nestFrame(context, (frame2) => {
        frame2.nodeKey = "with~tilde";
        assert.equal(currentPointer(context), "/with~1slash/with~0tilde");
      });
    });
  });
});

void suite("Context location", () => {
  void test("includes canonical URI of enclosing resource", () => {
    const context = createContext();
    const node = {};
    const resource = createResource("https://example.com/schema.json", node);
    setResource(context, resource);

    nestFrame(context, (frame1) => {
      frame1.node = node;
      assert.equal(currentLocation(context), "https://example.com/schema.json");

      nestFrame(context, (frame2) => {
        frame2.nodeKey = "property";
        assert.equal(
          currentLocation(context),
          "https://example.com/schema.json#/property",
        );
      });
    });
  });

  void test("references nearest canonical resource", () => {
    const context = createContext();
    const node1 = { id: 1 };
    const node2 = { id: 2 };

    const resource1 = createResource("https://example.com/schema1.json", node1);
    const resource2 = createResource("https://example.com/schema2.json", node2);
    setResource(context, resource1);
    setResource(context, resource2);

    nestFrame(context, (frame1) => {
      frame1.node = node1;
      assert.equal(
        currentLocation(context),
        "https://example.com/schema1.json",
      );

      nestFrame(context, (frame2) => {
        frame2.node = node2;
        // Should use node2's canonical URI, not build path from node1
        assert.equal(
          currentLocation(context),
          "https://example.com/schema2.json",
        );

        frame2.nodeKey = "property";
        // Key is ignored because node2 has its own canonical URI
        assert.equal(
          currentLocation(context),
          "https://example.com/schema2.json",
        );
      });
    });
  });

  void test("includes pointer in URI fragment", () => {
    const context = createContext();

    nestFrame(context, (frame1) => {
      frame1.nodeKey = "root";
      assert.equal(currentLocation(context), "#/root");

      nestFrame(context, (frame2) => {
        frame2.nodeKey = "nested";
        assert.equal(currentLocation(context), "#/root/nested");
      });
    });
  });

  void test("pointer fragment references nearest canonical resource", () => {
    const context = createContext();
    const root = {};
    const middle = {};
    const leaf = {};

    const rootResource = createResource("https://example.com/root.json", root);
    const leafResource = createResource("https://example.com/leaf.json", leaf);
    setResource(context, rootResource);
    setResource(context, leafResource);

    nestFrame(context, (frame1) => {
      frame1.node = root;
      assert.equal(currentLocation(context), "https://example.com/root.json");

      nestFrame(context, (frame2) => {
        frame2.nodeKey = "middle";
        frame2.node = middle; // No canonical URI, builds path from root
        assert.equal(
          currentLocation(context),
          "https://example.com/root.json#/middle",
        );

        nestFrame(context, (frame3) => {
          frame3.nodeKey = "ignored";
          frame3.node = leaf; // Has canonical URI, uses it directly
          assert.equal(
            currentLocation(context),
            "https://example.com/leaf.json",
          );
        });
      });
    });
  });
});
