import assert from "node:assert/strict";
import test from "node:test";
import { Component } from "./routes/JobsPage.js";

test("the jobs page is available as a separately importable route module", () => {
  assert.equal(typeof Component, "function");
});
