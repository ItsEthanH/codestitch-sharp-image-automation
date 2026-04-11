// lib/index.js
const scanner = require("./scanner");
const fs = require("fs").promises;
const path = require("path");

async function run(options) {
	console.log(`🚀 CodeStitch Image Optimizer`);
	console.log(`  Base URL: ${options.baseUrl}`);
	console.log(`  Output directory: ${options.outputDir}`);

	if (options.targetPage) {
		console.log(`  Target page: ${options.targetPage}`);
	}

	if (options.skinny) {
		console.log(`  Skinny mode: ${options.skinnyFormat.toUpperCase()} only`);
	}

	if (options.skipOptimized) {
		console.log(`  Skip mode: skipping images that already have optimized <source> children`);
	}

	// Make paths absolute
	const contentDir = path.resolve(process.cwd(), options.contentDir);
	const outputDir = path.resolve(process.cwd(), options.outputDir);

	// Create output directory if it doesn't exist
	await fs.mkdir(outputDir, { recursive: true });

	// Scan pages and optimize images
	const results = await scanner.scanProject({
		contentDir,
		outputDir,
		baseUrl: options.baseUrl,
		targetPage: options.targetPage,
		skinny: options.skinny,
		skinnyFormat: options.skinnyFormat,
		skipOptimized: options.skipOptimized,
	});

	return results;
}

module.exports = { run };