import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.POKEKART_E2E_PORT ?? 5281);
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  // software WebGL (swiftshader) is CPU-bound; a slow boot can occasionally
  // blow a per-step wait, so retry flaky runs rather than fail the suite
  retries: 2,
  reporter: [["list"]],
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Three.js needs a working WebGL context; force software GL so the
        // 3D world renders even on a headless CI box with no real GPU.
        launchOptions: {
          executablePath: chromiumExecutablePath,
          args: [
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist"
          ]
        }
      }
    }
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
