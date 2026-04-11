const fs = require("fs").promises;
const path = require("path");
const yaml = require("js-yaml");
const { chromium } = require("playwright-chromium");
const generator = require("./generator");

// Define breakpoints to measure
const breakpoints = [
	{ width: 320, height: 700 },
	{ width: 1024, height: 800 },
	{ width: 1599, height: 900 },
	{ width: 1920, height: 1080 },
];

// Maximum width for scaled images
const MAX_SCALED_WIDTH = 2500;

// Function to find all HTML files in the content directory
async function findHtmlFiles(dir, fileList = []) {
	try {
		const files = await fs.readdir(dir, { withFileTypes: true });

		for (const file of files) {
			const filePath = path.join(dir, file.name);

			if (file.isDirectory()) {
				// Recursively scan subdirectories
				await findHtmlFiles(filePath, fileList);
			} else if (file.name.endsWith(".html") || file.name.endsWith(".njk")) {
				fileList.push(filePath);
			}
		}
	} catch (error) {
		console.error(`Error scanning directory ${dir}:`, error);
	}

	return fileList;
}

// Function to extract permalink from frontmatter
async function extractPermalink(filePath) {
	try {
		const content = await fs.readFile(filePath, "utf8");

		// Split content into lines
		const lines = content.split(/\r?\n/);

		// Find the line with 'permalink:'
		const permalinkLine = lines.find((line) => line.includes("permalink:"));

		if (permalinkLine) {
			// Extract text between quotes (single or double)
			const match = permalinkLine.match(/['"]([^'"]+)['"]/);

			if (match) {
				let permalink = match[1];

				// Ensure permalink starts and ends with a slash
				permalink = permalink.startsWith("/") ? permalink : "/" + permalink;
				permalink = permalink.endsWith("/") ? permalink : permalink + "/";

				console.log(`  Found permalink in frontmatter: ${permalink}`);
				return permalink;
			}
		}

		console.log(`  No permalink found in frontmatter for ${filePath}`);
		return null;
	} catch (error) {
		console.error(`Error reading file ${filePath}:`, error);
		return null;
	}
}

// Function to measure images on a page
async function measureImagesOnPage(url, pageName, outputDir, skinny = false, skinnyFormat = null, skipOptimized = false) {
	console.log(`\n  📐 Measuring images on ${url}`);

	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		// Navigate to the page
		await page.goto(url, { waitUntil: "networkidle" });
		console.log("  Page loaded successfully");

		// Find all picture elements
		const allPictureElements = await page.$$("picture");
		console.log(`  Found ${allPictureElements.length} total picture elements`);

		// Measure each picture at each breakpoint
		const results = {};
		let processedCount = 0;

		// First, set mobile viewport to identify above-the-fold images
		const mobileBreakpoint = breakpoints.find((bp) => bp.width === 320);
		await page.setViewportSize(mobileBreakpoint);
		await page.waitForTimeout(500); // Give a bit more time for responsive layouts to adjust

		// Get viewport height for above-the-fold detection
		const viewportHeight = page.viewportSize().height;

		for (let i = 0; i < allPictureElements.length; i++) {
			const picture = allPictureElements[i];

			// Get image element
			const imgElement = await picture.$("img");
			if (!imgElement) {
				continue;
			}

			// Filter out if image is SVG
			const imgSrc = await imgElement.getAttribute("src");
			if (imgSrc && imgSrc.toLowerCase().endsWith(".svg")) {
				continue;
			}

			// If --skip is set, skip pictures that already have typed <source> elements (sharp plugin output)
			if (skipOptimized) {
				const hasTypedSource = await picture.evaluate(pic =>
					Array.from(pic.querySelectorAll("source")).some(s => s.hasAttribute("type"))
				);
				if (hasTypedSource) {
					console.log(`  ⏭ Skipping already-optimized image: ${imgSrc}`);
					continue;
				}
			}

			// Get picture class
			const pictureClass = await picture.evaluate((pic) => pic.className || "");

			// Get image information
			const imgInfo = await imgElement.evaluate((img) => {
				return {
					src: img.src,
					alt: img.alt || "",
					id: img.id || "",
					isPNG: img.src.toLowerCase().endsWith(".png"),
				};
			});

			// Check if image is above the fold on mobile
			const isAboveTheFold = await imgElement.evaluate((img, viewportHeight) => {
				const rect = img.getBoundingClientRect();
				// Image is considered above the fold if any part of it is visible in the viewport
				return rect.top < viewportHeight && rect.bottom > 0;
			}, viewportHeight);

			// Use an iterating image count as a unique identifier
			const id = `image-${i}`;

			results[id] = {
				original: imgInfo,
				pictureClass: pictureClass,
				isAboveTheFold: isAboveTheFold,
				measurements: {},
			};

			processedCount++;

			// Measure at each breakpoint
			for (const bp of breakpoints) {
				// Resize viewport
				await page.setViewportSize(bp);

				// Wait for responsive adjustments
				await page.waitForTimeout(300);

				// Measure the image
				const size = await imgElement
					.evaluate((img) => {
						const rect = img.getBoundingClientRect();
						return {
							width: Math.round(rect.width),
							height: Math.round(rect.height),
						};
					})
					.catch(() => null);

				if (size) {
					// Apply minimum size of 1x1 for images with zero dimensions
					const displayWidth = Math.max(1, size.width);
					const displayHeight = Math.max(1, size.height);

					let scaledWidth = displayWidth;
					let scaledHeight = displayHeight;

					if (scaledHeight > 1 && scaledWidth > 1) {
						// Apply scaling logic
						scaledWidth = displayWidth * 2;
						scaledHeight = displayHeight * 2;
					}

					// If width exceeds MAX_SCALED_WIDTH, cap it and adjust height proportionally
					if (scaledWidth > MAX_SCALED_WIDTH) {
						const scaleFactor = MAX_SCALED_WIDTH / scaledWidth;
						scaledWidth = MAX_SCALED_WIDTH;
						scaledHeight = Math.round(scaledHeight * scaleFactor);
					}

					// Store original and scaled measurements
					results[id].measurements[`${bp.width}x${bp.height}`] = {
						original: { width: displayWidth, height: displayHeight },
						scaled: { width: scaledWidth, height: scaledHeight },
					};
				}
			}
		}

		// Generate markup for this page
		if (Object.keys(results).length > 0) {
			let allMarkup = "";

			// Count how many above-the-fold images were detected
			const aboveFoldCount = Object.values(results).filter((data) => data.isAboveTheFold).length;
			console.log(`  Detected ${aboveFoldCount} above-the-fold images on mobile viewport`);

			for (const [id, data] of Object.entries(results)) {
				const markup = generator.generatePictureMarkup(id, data, skinny, skinnyFormat);
				allMarkup += markup + "\n\n";
			}

			// Create directory structure that mirrors the content structure
			// Create directories if needed
			const outputDirPath = path.dirname(path.join(outputDir, pageName));
			await fs.mkdir(outputDirPath, { recursive: true });

			// Save the file
			const outputFilePath = path.join(outputDir, pageName);
			await fs.writeFile(outputFilePath, allMarkup, "utf8");
			console.log(`  ✅ Optimized ${processedCount} images. Saved to ${outputFilePath}`);

			return {
				pageUrl: url,
				imageCount: processedCount,
				aboveFoldCount: aboveFoldCount,
				outputPath: outputFilePath,
			};
		} else {
			console.log(`  ⚠️ No images found on this page`);
			return {
				pageUrl: url,
				imageCount: 0,
				aboveFoldCount: 0,
				outputPath: null,
			};
		}
	} catch (error) {
		console.error(`  ❌ Error optimizing page ${url}:`, error);
		return {
			pageUrl: url,
			error: error.message,
			imageCount: 0,
			aboveFoldCount: 0,
			outputPath: null,
		};
	} finally {
		await browser.close();
	}
}

// Function to resolve target page to an actual file path
async function resolveTargetPage(targetPage, contentDir) {
	// Special case for "home" to target the index.html file
	if (targetPage.toLowerCase() === "home") {
		const indexPath = path.join(process.cwd(), "src", "index.html");
		try {
			await fs.access(indexPath);
			return indexPath;
		} catch (error) {
			console.error(`  ❌ Home page (${indexPath}) not found`);
			return null;
		}
	}

	// For other pages, look under /src/content/pages/
	const pagesDir = path.join(process.cwd(), "src", "content", "pages");

	// Construct the expected file path with .html extension
	const targetPath = path.join(pagesDir, `${targetPage}.html`);

	try {
		await fs.access(targetPath);
		return targetPath;
	} catch (error) {
		console.error(`  ❌ Target page (${targetPath}) not found`);
		return null;
	}
}

// Main function to scan the project and process pages
async function scanProject(options) {
	try {
		console.log(`🔍 Scanning content directory: ${options.contentDir}`);

		// If a specific target was provided, resolve it to a file path
		let filesToProcess = [];

		if (options.targetPage) {
			console.log(`  Looking for target page: ${options.targetPage}`);
			const targetFile = await resolveTargetPage(options.targetPage, options.contentDir);

			if (targetFile) {
				console.log(`  Target page found: ${targetFile}`);
				filesToProcess.push(targetFile);
			} else {
				console.error(`  ❌ Target page "${options.targetPage}" not found. Exiting.`);
				return {
					totalPages: 0,
					pagesWithImages: 0,
					totalImages: 0,
					aboveFoldImages: 0,
					pagesWithErrors: 0,
					outputDir: options.outputDir,
				};
			}
		} else {
			// Find all HTML files in the content directory
			const pagesDir = path.join(process.cwd(), "src", "content", "pages");
			const contentFiles = await findHtmlFiles(pagesDir);

			// Also add the index.html file
			const indexFile = path.join(process.cwd(), "src", "index.html");
			try {
				await fs.access(indexFile);
				filesToProcess = [...contentFiles, indexFile];
			} catch (error) {
				filesToProcess = contentFiles;
				console.warn(`  ⚠️ Index file (${indexFile}) not found`);
			}

			console.log(`  Found ${filesToProcess.length} HTML files to process`);
		}

		// Create a list of pages to process
		const pageList = [];

		// Process each HTML file
		for (const filePath of filesToProcess) {
			// Special handling for index.html
			if (filePath.endsWith("index.html") && !filePath.includes("/pages/")) {
				pageList.push({
					filePath: filePath,
					permalink: "/",
					pageName: "index.html",
					url: `${options.baseUrl}/`,
				});
				continue;
			}

			// For content pages, extract permalink or create a default one
			const permalink = await extractPermalink(filePath);

			if (permalink) {
				// For the output path: remove leading/trailing slashes and replace inner slashes with hyphens
				const outputName = permalink.replace(/^\/|\/$/g, "").replace(/\//g, "-") + ".html";

				pageList.push({
					filePath: filePath,
					permalink: permalink,
					pageName: outputName,
					url: `${options.baseUrl}${permalink}`,
				});
			} else {
				// Create a default permalink based on file path
				const relativePath = path.relative(path.join(process.cwd(), "src", "content", "pages"), filePath);

				const filePathWithoutExt = relativePath.replace(/\.html$/, "");
				const defaultPermalink = `/${filePathWithoutExt}/`;
				const outputName = filePathWithoutExt.replace(/\//g, "-") + ".html";

				pageList.push({
					filePath: filePath,
					permalink: defaultPermalink,
					pageName: outputName,
					url: `${options.baseUrl}${defaultPermalink}`,
				});
			}
		}

		console.log(`\n📋 Pages to process: ${pageList.length}`);
		console.log(`  Pages found:`);
		pageList.forEach((page, index) => {
			console.log(`  ${index + 1}. ${page.url} (output: ${page.pageName})`);
		});

		// Process each page
		const results = [];

		for (let i = 0; i < pageList.length; i++) {
			const page = pageList[i];
			console.log(`\n🛠️ Processing page ${i + 1}/${pageList.length}: ${page.permalink}`);

			const result = await measureImagesOnPage(page.url, page.pageName, options.outputDir, options.skinny, options.skinnyFormat, options.skipOptimized);
			results.push(result);
		}

		// Generate summary report
		const successCount = results.filter((r) => r.imageCount > 0).length;
		const totalImages = results.reduce((sum, r) => sum + r.imageCount, 0);
		const aboveFoldImages = results.reduce((sum, r) => sum + (r.aboveFoldCount || 0), 0);
		const errorCount = results.filter((r) => r.error).length;

		console.log(`\n🏁 Project scan complete!`);
		console.log(`  Total pages scanned: ${results.length}`);
		console.log(`  Pages with images: ${successCount}`);
		console.log(`  Total images processed: ${totalImages}`);
		console.log(`  Above-the-fold images detected: ${aboveFoldImages}`);
		console.log(`  Pages with errors: ${errorCount}`);
		console.log(`  Optimized image markup saved to: ${options.outputDir}`);

		return {
			totalPages: results.length,
			pagesWithImages: successCount,
			totalImages: totalImages,
			aboveFoldImages: aboveFoldImages,
			pagesWithErrors: errorCount,
			outputDir: options.outputDir,
		};
	} catch (error) {
		console.error("❌ Error scanning project:", error);
		throw error;
	}
}

module.exports = { scanProject, measureImagesOnPage };