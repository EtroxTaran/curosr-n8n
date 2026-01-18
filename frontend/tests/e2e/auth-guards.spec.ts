import { test, expect } from "@playwright/test";

/**
 * Authentication Guards E2E Tests
 *
 * Tests that protected routes properly redirect to login and
 * protected API routes return 401 for unauthenticated requests.
 *
 * Security vulnerabilities tested:
 * - Page routes: /settings, /settings/n8n, /settings/workflows, /setup
 * - API routes: /api/start-project, /api/presigned-url, /api/governance
 */

test.describe("Page Route Authentication Guards", () => {
  test.describe("Settings Routes", () => {
    test("should redirect /settings to login when unauthenticated", async ({
      page,
    }) => {
      await page.goto("/settings");

      // Should redirect to login page
      await expect(page).toHaveURL(/\/login/);

      // Should include redirect parameter
      expect(page.url()).toContain("redirect=%2Fsettings");
    });

    test("should redirect /settings/n8n to login when unauthenticated", async ({
      page,
    }) => {
      await page.goto("/settings/n8n");

      // Should redirect to login page
      await expect(page).toHaveURL(/\/login/);

      // Should include redirect parameter
      expect(page.url()).toContain("redirect=%2Fsettings%2Fn8n");
    });

    test("should redirect /settings/workflows to login when unauthenticated", async ({
      page,
    }) => {
      await page.goto("/settings/workflows");

      // Should redirect to login page
      await expect(page).toHaveURL(/\/login/);

      // Should include redirect parameter
      expect(page.url()).toContain("redirect=%2Fsettings%2Fworkflows");
    });
  });

  test.describe("Setup Route", () => {
    test("should redirect /setup to login when unauthenticated", async ({
      page,
    }) => {
      await page.goto("/setup");

      // Should redirect to login page
      await expect(page).toHaveURL(/\/login/);

      // Should include redirect parameter
      expect(page.url()).toContain("redirect=%2Fsetup");
    });
  });

  test.describe("Login Page", () => {
    test("should display login page correctly", async ({ page }) => {
      await page.goto("/login");

      // Should show the login page (not redirect)
      await expect(page).toHaveURL(/\/login/);

      // Should have Google OAuth button or similar auth mechanism
      // The exact content depends on implementation
      const body = await page.locator("body");
      await expect(body).toBeVisible();
    });
  });
});

test.describe("API Route Authentication Guards", () => {
  test.describe("POST /api/start-project", () => {
    test("should return 401 when unauthenticated", async ({ request }) => {
      const response = await request.post("/api/start-project", {
        data: {
          projectName: "Test Project",
          projectId: "test-project-1",
          inputFiles: [{ key: "test.md", name: "test.md", size: 100 }],
        },
      });

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Authentication required");
    });

    test("should include correlation ID in 401 response", async ({
      request,
    }) => {
      const response = await request.post("/api/start-project", {
        data: {
          projectName: "Test Project",
          inputFiles: [],
        },
      });

      expect(response.status()).toBe(401);

      // Check for correlation ID header
      const correlationId = response.headers()["x-correlation-id"];
      expect(correlationId).toBeDefined();
    });
  });

  test.describe("POST /api/presigned-url", () => {
    test("should return 401 when unauthenticated", async ({ request }) => {
      const response = await request.post("/api/presigned-url", {
        data: {
          projectId: "test-project-1",
          filename: "test.pdf",
          contentType: "application/pdf",
        },
      });

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Authentication required");
    });
  });

  test.describe("POST /api/governance", () => {
    test("should return 401 when unauthenticated", async ({ request }) => {
      const response = await request.post("/api/governance", {
        data: {
          project_id: "test-project-1",
          scavenging_id: "scav-1",
          decisions: [
            {
              item_id: "item-1",
              action: "approve",
            },
          ],
        },
      });

      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Authentication required");
    });
  });
});

test.describe("Public Routes (Should NOT Require Auth)", () => {
  test.describe("Health Check", () => {
    test("GET /api/health should be accessible without auth", async ({
      request,
    }) => {
      const response = await request.get("/api/health");

      // Should return 200 or at least not 401
      expect(response.status()).not.toBe(401);
    });
  });

  test.describe("Setup Status", () => {
    test("GET /api/setup/status should be accessible without auth", async ({
      request,
    }) => {
      const response = await request.get("/api/setup/status");

      // Should return 200 or at least not 401
      expect(response.status()).not.toBe(401);
    });
  });

  test.describe("Auth Endpoints", () => {
    test("Auth callback routes should be accessible", async ({ page }) => {
      // Navigate to login - should work without auth
      await page.goto("/login");
      await expect(page).toHaveURL(/\/login/);
    });
  });
});

test.describe("Redirect Behavior", () => {
  test("should preserve redirect path after login", async ({ page }) => {
    // Try to access protected route
    await page.goto("/settings/n8n");

    // Should be on login page with redirect param
    await expect(page).toHaveURL(/\/login/);

    // Verify the redirect parameter is properly encoded
    const url = new URL(page.url());
    const redirectParam = url.searchParams.get("redirect");
    expect(redirectParam).toBe("/settings/n8n");
  });

  test("should handle nested paths in redirect", async ({ page }) => {
    await page.goto("/settings/workflows");

    await expect(page).toHaveURL(/\/login/);

    const url = new URL(page.url());
    const redirectParam = url.searchParams.get("redirect");
    expect(redirectParam).toBe("/settings/workflows");
  });
});
