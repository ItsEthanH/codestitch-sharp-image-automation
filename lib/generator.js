// Function to generate picture element markup based on measurements
function generatePictureMarkup(id, data, skinny = false, skinnyFormat = null) {
	const { original, pictureClass, measurements, isAboveTheFold } = data;

	// Extract image path from src - convert to /assets path format
	const imgSrc = original.src.includes("/assets/") ? "/assets/" + original.src.split("/assets/")[1] : original.src;
	const imgAlt = original.alt || "";

	// Determine if the image is a PNG
	const isPNG = imgSrc.toLowerCase().endsWith(".png");

	// Choose the appropriate format for fallback (png or jpeg)
	const fallbackFormat = isPNG ? "png" : "jpeg";

	// Generate preload link for above-the-fold images
	let markup = "";
	if (isAboveTheFold) {
		// Get mobile dimensions for preload
		const mobileMeasurements = measurements["320x700"];
		if (mobileMeasurements && mobileMeasurements.scaled) {
			const { width, height } = mobileMeasurements.scaled;
			const preloadFormat = skinny ? skinnyFormat : "avif";
			markup += `<!--  -->\n<link rel="preload" as="image" href="{% getUrl "${imgSrc}" | resize({ width: ${width}, height: ${height} }) | ${preloadFormat} %}" />\n<!--  -->\n\n`;
		}
	}

	// Start building picture markup
	markup += `<picture${pictureClass ? ` class="${pictureClass}"` : ""}>\n`;

	// Check if image has 1x1 dimensions at desktop
	const desktopMeasurements = measurements["1920x1080"];
	const needsIntermediateBreakpoint = desktopMeasurements && desktopMeasurements.original && desktopMeasurements.original.width === 1 && desktopMeasurements.original.height === 1;

	// Breakpoint configurations
	const breakpointMap = {
		"320x700": { name: "Mobile", mediaQuery: "(max-width: 600px)" },
		"1024x800": { name: "Tablet", mediaQuery: "(max-width: 1024px)" },
	};

	// Add intermediate breakpoint if needed
	if (needsIntermediateBreakpoint) {
		breakpointMap["1024x800"] = { name: "Tablet", mediaQuery: "(max-width: 1024px)" };
		breakpointMap["1599x900"] = { name: "Large Tablet", mediaQuery: "(min-width: 1024px) and (max-width: 1600px)" };
		breakpointMap["1920x1080"] = { name: "Desktop", mediaQuery: "(min-width: 1600px)" };
	} else {
		breakpointMap["1920x1080"] = { name: "Desktop", mediaQuery: "(min-width: 1024px)" };
	}

	// Add mobile, tablet, and desktop sources in order
	const orderedBreakpoints = ["320x700", "1024x800"];

	// Add intermediate breakpoint if needed
	if (needsIntermediateBreakpoint) {
		orderedBreakpoints.push("1599x900", "1920x1080");
	} else {
		orderedBreakpoints.push("1920x1080");
	}

	for (const bp of orderedBreakpoints) {
		if (!measurements[bp] || !measurements[bp].scaled) {
			// For the intermediate breakpoint that doesn't exist yet
			if (bp === "1599x900" && needsIntermediateBreakpoint) {
				// Get tablet measurements as a fallback for the intermediate breakpoint
				const tabletMeasurements = measurements["1024x800"];
				if (tabletMeasurements && tabletMeasurements.scaled) {
					const { width, height } = tabletMeasurements.scaled;
					const breakpointInfo = breakpointMap[bp];

					markup += `\t<!--${breakpointInfo.name} Image-->\n`;
					if (skinny) {
						// Skinny mode: only one optimized format
						markup += `\t<source media="${breakpointInfo.mediaQuery}" srcset="{% getUrl "${imgSrc}" | resize({ width: ${width}, height: ${height} }) | ${skinnyFormat} %}" type="image/${skinnyFormat}">\n`;
					} else {
						// Full mode: all three formats
						markup += `\t<source media="${breakpointInfo.mediaQuery}" srcset="{% getUrl "${imgSrc}" | resize({ width: ${width}, height: ${height} }) | avif %}" type="image/avif">\n`;
						markup += `\t<source media="${breakpointInfo.mediaQuery}" srcset="{% getUrl "${imgSrc}" | resize({ width: ${width}, height: ${height} }) | webp %}" type="image/webp">\n`;
						markup += `\t<source media="${breakpointInfo.mediaQuery}" srcset="{% getUrl "${imgSrc}" | resize({ width: ${width}, height: ${height} }) | ${fallbackFormat} %}" type="image/${fallbackFormat}">\n`;
					}
				}
			}
			continue;
		}

		const { width, height } = measurements[bp].scaled;
		const breakpointInfo = breakpointMap[bp];

		// Add comment for each breakpoint
		markup += `\t<!--${breakpointInfo.name} Image-->\n`;

		if (skinny) {
			// Skinny mode: only one optimized format
			markup += `\t<source media="${breakpointInfo.mediaQuery}" srcset="{% getUrl "${imgSrc}" | resize({ width: ${width}, height: ${height} }) | ${skinnyFormat} %}" type="image/${skinnyFormat}">\n`;
		} else {
			// Full mode: all three formats (avif, webp, and fallback format)
			markup += `\t<source media="${breakpointInfo.mediaQuery}" srcset="{% getUrl "${imgSrc}" | resize({ width: ${width}, height: ${height} }) | avif %}" type="image/avif">\n`;
			markup += `\t<source media="${breakpointInfo.mediaQuery}" srcset="{% getUrl "${imgSrc}" | resize({ width: ${width}, height: ${height} }) | webp %}" type="image/webp">\n`;
			markup += `\t<source media="${breakpointInfo.mediaQuery}" srcset="{% getUrl "${imgSrc}" | resize({ width: ${width}, height: ${height} }) | ${fallbackFormat} %}" type="image/${fallbackFormat}">\n`;
		}
	}

	// Get desktop dimensions for the fallback image
	const fallbackWidth = desktopMeasurements?.original?.width;
	const fallbackHeight = desktopMeasurements?.original?.height;
	const scaledWidth = desktopMeasurements?.scaled?.width;
	const scaledHeight = desktopMeasurements?.scaled?.height;

	// Add fallback image with conditional loading attribute
	markup += `\t<img src="{% getUrl "${imgSrc}" | resize({ width: ${scaledWidth}, height: ${scaledHeight} }) | ${fallbackFormat} %}" alt="${imgAlt}" width="${fallbackWidth}" height="${fallbackHeight}"${
		isAboveTheFold ? ' fetchpriority="high"' : ' loading="lazy"'
	} decoding="async">\n`;

	markup += `</picture>`;
	return markup;
}

module.exports = { generatePictureMarkup };
