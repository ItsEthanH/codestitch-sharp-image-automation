# Testing Guide

This project now includes a comprehensive integration test suite using Jest and real Playwright browser automation.

## Running Tests

```bash
npm test
```

This runs all tests in the `tests/` directory. Tests use real Playwright to measure images and validate output.

## What's Tested

### 1. **fetchpriority and loading attributes**
   - ✅ Above-fold images get `fetchpriority="high"`
   - ✅ Above-fold images do NOT have `loading="lazy"`
   - ✅ Above-fold images get `<link rel="preload">` tags
   - ✅ Below-fold images get `loading="lazy"`
   - ✅ Below-fold images do NOT have `fetchpriority`
   - ✅ Only one preload link is generated (not one per image)

### 2. **--skip flag behavior**
   - ✅ Images with typed `<source>` elements are skipped (already optimized)
   - ✅ Art-direction images without `type` attribute are preserved
   - ✅ Plain unoptimized images are preserved
   - ✅ Without `--skip`, all images are processed

### 3. **Format modes**
   - ✅ Full mode generates AVIF, WebP, and fallback format sources
   - ✅ Skinny AVIF mode generates only AVIF sources
   - ✅ Skinny WebP mode generates only WebP sources
   - ✅ PNG images correctly use `.png` fallback (not `.jpeg`)

## Test Architecture

### How it works

1. **HTTP Server** (`tests/helpers/server.js`) — Serves test fixture HTML files on a random free port
2. **Fixtures** (`tests/fixtures/`) — Minimal HTML pages with `<picture>` elements for testing
   - `basic-page.html` — One above-fold, one below-fold image
   - `skip-page.html` — Tests art-direction vs. optimized images
   - `formats-page.html` — JPEG and PNG for format testing
3. **Tests** (`tests/optimizer.test.js`) — Jest test suite calling `measureImagesOnPage()` directly

### Why real Playwright?

- **Authentic** — Tests run the actual browser measurement logic, catching real rendering issues
- **No mocks** — The viewport sizing, bounding rect calculations, and DOM traversal are all real
- **Regression detection** — If image detection logic breaks, tests fail immediately

### Why Jest?

- **Simple** — Minimal setup, batteries-included assertions
- **Snapshot-ready** — Can capture generated markup if needed in future
- **CI/CD friendly** — Standard Node test framework, no special tooling required

## Test Fixtures Explained

### basic-page.html
```html
<picture>...</picture>              <!-- Above-fold: near top of page -->
<div style="height: 1500px;"></div> <!-- Spacer pushes next image down -->
<picture>...</picture>              <!-- Below-fold: starts at 1700px -->
```

The spacer ensures the second picture is below the 700px mobile viewport height. This tests both above-fold (preload, fetchpriority) and below-fold (loading=lazy) behavior in one test.

### skip-page.html
Tests the detection logic for `--skip` flag:
1. **Optimized image** — Has `<source type="image/avif">` (should skip with `--skip`)
2. **Art-direction** — Has `<source>` but NO `type` attribute (should NOT skip)
3. **Plain** — No sources at all (should NOT skip)

This validates that the detection key (`type` attribute) correctly identifies already-optimized images.

### formats-page.html
One JPEG and one PNG, to verify:
- Full mode generates all three formats (AVIF, WebP, fallback)
- Skinny modes work correctly
- PNG images use `.png` fallback, not `.jpeg`

## Modifying Tests

To add a new test:

1. Create a fixture HTML file in `tests/fixtures/`
2. Add a test case in `tests/optimizer.test.js`
3. Call `measureImagesOnPage(url, outputName, outputDir, skinny?, skinnyFormat?, skipOptimized?)`
4. Read and assert on the generated markup file

Example:
```javascript
test("my new feature works", async () => {
    const url = `${baseUrl}/my-page.html`;
    await measureImagesOnPage(url, "my-page.html", outputDir);
    
    const filePath = path.join(outputDir, "my-page.html");
    const content = await fs.readFile(filePath, "utf8");
    
    expect(content).toContain("expected output");
});
```

## Performance

- Full test suite: ~65 seconds
- Each test: ~3-5 seconds (Playwright startup + page rendering + measurements)
- Jest runs tests serially to avoid port conflicts

## Scripts

- `npm test` — Run Jest test suite
- `npm run:all` — Manually run optimizer on your project (old `test` script)
- `npm run:home` — Manually run optimizer on home page only

## CI/CD Integration

When ready to add CI/CD:
- Tests can run on GitHub Actions, GitLab CI, CircleCI, etc.
- Configuration would look like:
  ```yaml
  - name: Install dependencies
    run: npm ci
  - name: Run tests
    run: npm test
  ```
- No additional setup needed—tests are self-contained and use real Playwright
