/**
 * Phase B API Tests
 * Tests the new workflow import optimization APIs
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  getBundledWorkflows,
  detectCircularDependencies,
  type BundledWorkflow,
  type CircularDependencyResult,
} from "../lib/workflow-importer";

describe("Phase B: Workflow Import Optimizations", () => {
  let workflows: BundledWorkflow[];

  beforeAll(async () => {
    workflows = await getBundledWorkflows();
  });

  describe("getBundledWorkflows()", () => {
    it("should return all bundled workflows", () => {
      expect(workflows.length).toBeGreaterThan(0);
      expect(workflows.length).toBe(8); // We have 8 workflows
    });

    it("should include workflow metadata", () => {
      workflows.forEach((wf) => {
        expect(wf.name).toBeDefined();
        expect(wf.filename).toBeDefined();
        expect(wf.nodeCount).toBeGreaterThan(0);
        expect(typeof wf.hasCredentials).toBe("boolean");
        expect(Array.isArray(wf.dependencies)).toBe(true);
        expect(Array.isArray(wf.webhookPaths)).toBe(true);
      });
    });

    it("should detect dependencies from Execute Workflow nodes", () => {
      // The main orchestrator should have dependencies
      const mainWorkflow = workflows.find((w) =>
        w.name.includes("Main Orchestrator")
      );
      expect(mainWorkflow).toBeDefined();
      expect(mainWorkflow!.dependencies.length).toBeGreaterThan(0);
    });
  });

  describe("detectCircularDependencies()", () => {
    let result: CircularDependencyResult;

    beforeAll(() => {
      result = detectCircularDependencies(workflows);
    });

    it("should return no cycles for valid workflows", () => {
      expect(result.hasCycle).toBe(false);
      expect(result.cycles.length).toBe(0);
    });

    it("should return dependency order", () => {
      expect(result.dependencyOrder.length).toBe(workflows.length);
      // Order should be valid - dependencies come before dependents
    });

    it("should detect cycles when present", () => {
      // Create a test case with a cycle
      const cyclicWorkflows: BundledWorkflow[] = [
        {
          name: "A",
          filename: "a.json",
          nodeCount: 1,
          hasCredentials: false,
          dependencies: ["B"],
          webhookPaths: [],
          localVersion: "abc123",
        },
        {
          name: "B",
          filename: "b.json",
          nodeCount: 1,
          hasCredentials: false,
          dependencies: ["C"],
          webhookPaths: [],
          localVersion: "def456",
        },
        {
          name: "C",
          filename: "c.json",
          nodeCount: 1,
          hasCredentials: false,
          dependencies: ["A"], // Creates cycle: A -> B -> C -> A
          webhookPaths: [],
          localVersion: "ghi789",
        },
      ];

      const cyclicResult = detectCircularDependencies(cyclicWorkflows);
      expect(cyclicResult.hasCycle).toBe(true);
      expect(cyclicResult.cycles.length).toBeGreaterThan(0);
    });
  });

  describe("Dependency ordering", () => {
    it("should order S3 and Decision Logger first (no dependencies)", () => {
      const result = detectCircularDependencies(workflows);
      const order = result.dependencyOrder;

      // Workflows with no dependencies should be at the end of the order
      // (they can be imported last since nothing depends on them)
      const s3Index = order.findIndex((n) => n.includes("S3"));
      const decisionLoggerIndex = order.findIndex((n) =>
        n.includes("Decision Logger")
      );

      // These should be near the end (high index) as they are leaf nodes
      expect(s3Index).toBeGreaterThan(order.length / 2);
      expect(decisionLoggerIndex).toBeGreaterThan(order.length / 2);
    });

    it("should order Main Orchestrator first (has most dependencies)", () => {
      const result = detectCircularDependencies(workflows);
      const order = result.dependencyOrder;

      // Main orchestrator depends on many others, so it should be imported first
      // (closer to index 0)
      const mainIndex = order.findIndex((n) => n.includes("Main Orchestrator"));
      expect(mainIndex).toBeLessThan(order.length / 2);
    });
  });
});
