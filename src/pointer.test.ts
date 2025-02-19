import assert from "node:assert/strict";
import { suite, test } from "node:test";
import {
  ResolutionError,
  resolvePointer,
  parseRelativePointer,
} from "tool-json";

void suite("JSON Pointer", () => {
  void test("resolves root pointers", () => {
    assert.deepEqual(resolvePointer("", null), null);
    assert.deepEqual(resolvePointer("", false), false);
    assert.deepEqual(resolvePointer("", true), true);
    assert.deepEqual(resolvePointer("", 0), 0);
    assert.deepEqual(resolvePointer("", 1), 1);
    assert.deepEqual(resolvePointer("", ""), "");
    assert.deepEqual(resolvePointer("", "test"), "test");
    assert.deepEqual(resolvePointer("", []), []);
    assert.deepEqual(resolvePointer("", [1]), [1]);
    assert.deepEqual(resolvePointer("", { foo: "bar" }), { foo: "bar" });
  });

  void test("resolves shallow object pointers", () => {
    const value = { x: 2, y: 3 };
    assert.deepEqual(resolvePointer("/x", value), 2);
    assert.deepEqual(resolvePointer("/y", value), 3);
  });

  void test("resolves nested object pointers", () => {
    const value = { p: { x: 2, y: 3 }, q: { x: 5, y: 7 } };
    assert.deepEqual(resolvePointer("/p", value), { x: 2, y: 3 });
    assert.deepEqual(resolvePointer("/p/x", value), 2);
    assert.deepEqual(resolvePointer("/p/y", value), 3);
    assert.deepEqual(resolvePointer("/q", value), { x: 5, y: 7 });
    assert.deepEqual(resolvePointer("/q/x", value), 5);
    assert.deepEqual(resolvePointer("/q/y", value), 7);
  });

  void test("resolves array pointers", () => {
    const value = ["a", "b", "c"];
    assert.deepEqual(resolvePointer("/0", value), "a");
    assert.deepEqual(resolvePointer("/1", value), "b");
    assert.deepEqual(resolvePointer("/2", value), "c");
  });

  void test("resolves nested array pointers", () => {
    const value = [
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ];
    assert.deepEqual(resolvePointer("/0", value), ["a", "b"]);
    assert.deepEqual(resolvePointer("/0/0", value), "a");
    assert.deepEqual(resolvePointer("/0/1", value), "b");
    assert.deepEqual(resolvePointer("/1", value), ["c", "d"]);
    assert.deepEqual(resolvePointer("/1/0", value), "c");
    assert.deepEqual(resolvePointer("/1/1", value), "d");
    assert.deepEqual(resolvePointer("/2", value), ["e", "f"]);
    assert.deepEqual(resolvePointer("/2/0", value), "e");
    assert.deepEqual(resolvePointer("/2/1", value), "f");
  });

  void test("resolves object->array pointers", () => {
    const value = { p: [2, 3], q: [5, 7] };
    assert.deepEqual(resolvePointer("/p/0", value), 2);
    assert.deepEqual(resolvePointer("/p/1", value), 3);
    assert.deepEqual(resolvePointer("/q/0", value), 5);
    assert.deepEqual(resolvePointer("/q/1", value), 7);
  });

  void test("resolves array->object pointers", () => {
    const value = [
      { x: 2, y: 3 },
      { x: 5, y: 7 },
    ];
    assert.deepEqual(resolvePointer("/0/x", value), 2);
    assert.deepEqual(resolvePointer("/0/y", value), 3);
    assert.deepEqual(resolvePointer("/1/x", value), 5);
    assert.deepEqual(resolvePointer("/1/y", value), 7);
  });

  void test("resolves pointers with ~ escapes", () => {
    const value = { "~": "~0", "~0": "~00", "~1": "~01", "0~": "0~0" };
    assert.deepEqual(resolvePointer("/~0", value), "~0");
    assert.deepEqual(resolvePointer("/~00", value), "~00");
    assert.deepEqual(resolvePointer("/~01", value), "~01");
    assert.deepEqual(resolvePointer("/0~0", value), "0~0");
  });

  void test("resolves pointers with / escapes", () => {
    const value = { "/": "~1", "/0": "~10", "/1": "~11", "1/": "1~1" };
    assert.deepEqual(resolvePointer("/~1", value), "~1");
    assert.deepEqual(resolvePointer("/~10", value), "~10");
    assert.deepEqual(resolvePointer("/~11", value), "~11");
    assert.deepEqual(resolvePointer("/1~1", value), "1~1");
  });

  void test("resolves pointers with empty keys", () => {
    const value = { "": { "": "foo", bar: "baz" } };
    assert.deepEqual(resolvePointer("/", value), { "": "foo", bar: "baz" });
    assert.deepEqual(resolvePointer("//", value), "foo");
    assert.deepEqual(resolvePointer("//bar", value), "baz");
  });

  void test("fails to resolve pointers to non-existent objects", () => {
    assert.throws(
      () => resolvePointer("/foo/baz", { foo: "bar" }),
      ResolutionError,
    );
  });

  void test("fails to resolve pointers to non-existent keys", () => {
    assert.throws(() => resolvePointer("/z", { x: 2, y: 3 }), ResolutionError);
  });

  void test("fails to resolve pointers to non-existent array indices", () => {
    assert.throws(() => resolvePointer("/0", []), ResolutionError);
    assert.throws(() => resolvePointer("/3", ["a", "b", "c"]), ResolutionError);
  });

  void test("fails to resolve pointers to invalid array indices", () => {
    assert.throws(() => resolvePointer("/-", []), ResolutionError);
    assert.throws(() => resolvePointer("/1.0", []), ResolutionError);
    assert.throws(() => resolvePointer("/size", []), ResolutionError);
  });

  void test("fails to resolve pointers that don't start with a slash", () => {
    assert.throws(() => resolvePointer("foo", {}), TypeError);
    assert.throws(() => resolvePointer("foo", { foo: "bar" }), TypeError);
  });
});

void suite("Relative JSON Pointer", () => {
  void test("parses relative pointers", () => {
    assert.deepEqual(parseRelativePointer("0"), {
      prefix: 0,
      tokens: undefined,
    });
    assert.deepEqual(parseRelativePointer("1/0"), { prefix: 1, tokens: ["0"] });
    assert.deepEqual(parseRelativePointer("2/highly/nested/objects"), {
      prefix: 2,
      tokens: ["highly", "nested", "objects"],
    });
    assert.deepEqual(parseRelativePointer("0#"), { prefix: 0, tokens: "#" });
    assert.deepEqual(parseRelativePointer("1#"), { prefix: 1, tokens: "#" });

    assert.deepEqual(parseRelativePointer("0/objects"), {
      prefix: 0,
      tokens: ["objects"],
    });
    assert.deepEqual(parseRelativePointer("1/nested/objects"), {
      prefix: 1,
      tokens: ["nested", "objects"],
    });
    assert.deepEqual(parseRelativePointer("2/foo/0"), {
      prefix: 2,
      tokens: ["foo", "0"],
    });
  });
});
