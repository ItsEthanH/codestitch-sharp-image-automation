#!/usr/bin/env node
// bin/index.js

const optimizer = require("../lib");
const args = process.argv.slice(2);

// Parse command line options
const options = {
	baseUrl: "http://localhost:8080",
	outputDir: "./image-optimizations",
	contentDir: "./src/content",
	autoStartServer: true,
	forceRun: false,
	targetPage: null,
	skinny: false,
	skinnyFormat: null,
	skipOptimized: false,
};

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--base-url" && i + 1 < args.length) {
		options.baseUrl = args[i + 1];
		i++;
	} else if (args[i] === "--output-dir" && i + 1 < args.length) {
		options.outputDir = args[i + 1];
		i++;
	} else if (args[i] === "--content-dir" && i + 1 < args.length) {
		options.contentDir = args[i + 1];
		i++;
	} else if (args[i] === "--target" && i + 1 < args.length) {
		options.targetPage = args[i + 1];
		i++;
	} else if (args[i] === "--skinny" && i + 1 < args.length) {
		const format = args[i + 1].toLowerCase();
		if (format === "avif" || format === "webp") {
			options.skinny = true;
			options.skinnyFormat = format;
			i++;
		} else {
			console.error(`Error: --skinny format must be either "avif" or "webp", got "${args[i + 1]}"`);
			process.exit(1);
		}
	} else if (args[i] === "--skip") {
		options.skipOptimized = true;
	} else if (args[i] === "--help" || args[i] === "-h") {
		console.log(`
CodeStitch Image Optimizer
--------------------------
Automatically optimize images for the CodeStitch Sharp Images plugin.

Usage:
  run-sharp-automation [options]

Options:
  --base-url URL         Development server URL (default: http://localhost:8080)
  --output-dir DIR       Output directory for optimized markup (default: ./image-optimizations)
  --content-dir DIR      Directory containing HTML/Nunjucks content files (default: ./src/content)
  --target PAGE          Specific page to optimize (e.g., home, about, services/tile-installation)
  --skinny FORMAT        Generate slim markup with only one optimized format (avif or webp)
  --skip                 Skip <picture> elements that already have typed <source> children (already optimized)
  --help, -h             Show this help message

Examples:
  run-sharp-automation                         # Optimize all pages with full format support
  run-sharp-automation --skinny avif           # Optimize all pages with only AVIF format
  run-sharp-automation --skinny webp           # Optimize all pages with only WebP format
  run-sharp-automation --target home           # Optimize only the home page (index.html)
  run-sharp-automation --target about          # Optimize only the about page
  run-sharp-automation --target services/tile-installation   # Optimize only the tile-installation page
  run-sharp-automation --target home --skinny avif           # Optimize home page with only AVIF format
    `);
		process.exit(0);
	}
}

// Run the optimizer
optimizer.run(options).catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
