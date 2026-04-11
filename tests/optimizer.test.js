const path = require("path");
const fs = require("fs").promises;
const os = require("os");
const { startServer, stopServer } = require("./helpers/server");
const { measureImagesOnPage } = require("../lib/scanner");

const FIXTURES_DIR = path.join(__dirname, "fixtures");

let serverHandle, baseUrl, outputDir;

beforeAll(async () => {
	serverHandle = await startServer(FIXTURES_DIR);
	baseUrl = `http://localhost:${serverHandle.port}`;
	outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "optimizer-test-"));
});

afterAll(async () => {
	await stopServer(serverHandle);
	await fs.rm(outputDir, { recursive: true, force: true });
});

// Clear output dir between tests
beforeEach(async () => {
	const files = await fs.readdir(outputDir).catch(() => []);
	await Promise.all(files.map((f) => fs.unlink(path.join(outputDir, f))));
});

describe("fetchpriority and loading attributes", () => {
	test("above-fold image gets fetchpriority=high", async () => {
		const url = `${baseUrl}/basic-page.html`;
		const result = await measureImagesOnPage(url, "basic-page.html", outputDir);

		const filePath = path.join(outputDir, "basic-page.html");
		const content = await fs.readFile(filePath, "utf8");

		expect(content).toContain('fetchpriority="high"');
	});

	test("above-fold image does NOT have loading=lazy", async () => {
		const url = `${baseUrl}/basic-page.html`;
		const result = await measureImagesOnPage(url, "basic-page.html", outputDir);

		const filePath = path.join(outputDir, "basic-page.html");
		const content = await fs.readFile(filePath, "utf8");

		// Split by picture tags and check the first one (above-fold)
		const pictures = content.split("<picture");
		expect(pictures[1]).toContain('fetchpriority="high"');
		expect(pictures[1]).not.toMatch(/fetchpriority="high"[^>]*loading="lazy"/);
	});

	test("above-fold image gets preload link", async () => {
		const url = `${baseUrl}/basic-page.html`;
		const result = await measureImagesOnPage(url, "basic-page.html", outputDir);

		const filePath = path.join(outputDir, "basic-page.html");
		const content = await fs.readFile(filePath, "utf8");

		expect(content).toContain('<link rel="preload" as="image"');
	});

	test("below-fold image gets loading=lazy", async () => {
		const url = `${baseUrl}/basic-page.html`;
		const result = await measureImagesOnPage(url, "basic-page.html", outputDir);

		const filePath = path.join(outputDir, "basic-page.html");
		const content = await fs.readFile(filePath, "utf8");

		// Should have at least one loading="lazy"
		expect(content).toContain('loading="lazy"');
	});

	test("below-fold image does NOT have fetchpriority", async () => {
		const url = `${baseUrl}/basic-page.html`;
		const result = await measureImagesOnPage(url, "basic-page.html", outputDir);

		const filePath = path.join(outputDir, "basic-page.html");
		const content = await fs.readFile(filePath, "utf8");

		// Split by picture tags and check the second one (below-fold)
		const pictures = content.split("<picture");
		expect(pictures[2]).toContain('loading="lazy"');
		expect(pictures[2]).not.toContain("fetchpriority");
	});

	test("only above-fold image gets preload link (exactly 1)", async () => {
		const url = `${baseUrl}/basic-page.html`;
		const result = await measureImagesOnPage(url, "basic-page.html", outputDir);

		const filePath = path.join(outputDir, "basic-page.html");
		const content = await fs.readFile(filePath, "utf8");

		const preloadCount = (content.match(/<link rel="preload"/g) || []).length;
		expect(preloadCount).toBe(1);
	});
});

describe("--skip flag behavior", () => {
	test("skip flag ignores images with typed <source> elements", async () => {
		const url = `${baseUrl}/skip-page.html`;
		const result = await measureImagesOnPage(url, "skip-page.html", outputDir, false, null, true);

		const filePath = path.join(outputDir, "skip-page.html");
		const content = await fs.readFile(filePath, "utf8");

		// Optimized image should NOT appear
		expect(content).not.toContain("/assets/images/optimized");
	});

	test("skip flag preserves art-direction images (no type attribute)", async () => {
		const url = `${baseUrl}/skip-page.html`;
		const result = await measureImagesOnPage(url, "skip-page.html", outputDir, false, null, true);

		const filePath = path.join(outputDir, "skip-page.html");
		const content = await fs.readFile(filePath, "utf8");

		// Art-direction image should appear
		expect(content).toContain("/assets/images/art");
	});

	test("skip flag preserves plain unoptimized images", async () => {
		const url = `${baseUrl}/skip-page.html`;
		const result = await measureImagesOnPage(url, "skip-page.html", outputDir, false, null, true);

		const filePath = path.join(outputDir, "skip-page.html");
		const content = await fs.readFile(filePath, "utf8");

		// Plain image should appear
		expect(content).toContain("/assets/images/plain");
	});

	test("without skip flag, all images are processed", async () => {
		const url = `${baseUrl}/skip-page.html`;
		const result = await measureImagesOnPage(url, "skip-page.html", outputDir, false, null, false);

		const filePath = path.join(outputDir, "skip-page.html");
		const content = await fs.readFile(filePath, "utf8");

		// All three images should appear
		expect(content).toContain("/assets/images/optimized");
		expect(content).toContain("/assets/images/art");
		expect(content).toContain("/assets/images/plain");
	});
});

describe("format modes", () => {
	test("full mode has avif, webp, and fallback formats", async () => {
		const url = `${baseUrl}/formats-page.html`;
		const result = await measureImagesOnPage(url, "formats-page.html", outputDir, false, null, false);

		const filePath = path.join(outputDir, "formats-page.html");
		const content = await fs.readFile(filePath, "utf8");

		expect(content).toContain("type=\"image/avif\"");
		expect(content).toContain("type=\"image/webp\"");
		expect(content).toContain("type=\"image/jpeg\"");
	});

	test("skinny avif mode generates avif sources only", async () => {
		const url = `${baseUrl}/formats-page.html`;
		const result = await measureImagesOnPage(url, "formats-page.html", outputDir, true, "avif", false);

		const filePath = path.join(outputDir, "formats-page.html");
		const content = await fs.readFile(filePath, "utf8");

		expect(content).toContain("type=\"image/avif\"");
		expect(content).not.toContain("type=\"image/webp\"");
		expect(content).not.toContain("type=\"image/jpeg\"");
	});

	test("skinny webp mode generates webp sources only", async () => {
		const url = `${baseUrl}/formats-page.html`;
		const result = await measureImagesOnPage(url, "formats-page.html", outputDir, true, "webp", false);

		const filePath = path.join(outputDir, "formats-page.html");
		const content = await fs.readFile(filePath, "utf8");

		expect(content).toContain("type=\"image/webp\"");
		expect(content).not.toContain("type=\"image/avif\"");
		expect(content).not.toContain("type=\"image/jpeg\"");
	});

	test("PNG image uses png fallback format", async () => {
		const url = `${baseUrl}/formats-page.html`;
		const result = await measureImagesOnPage(url, "formats-page.html", outputDir, false, null, false);

		const filePath = path.join(outputDir, "formats-page.html");
		const content = await fs.readFile(filePath, "utf8");

		// Should have both jpeg and png fallbacks
		expect(content).toContain("| jpeg");
		expect(content).toContain("| png");
	});
});
