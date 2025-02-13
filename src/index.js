import { JSDOM } from 'jsdom';
import fs from 'fs';
import {processLink} from "./processLink.js";



(async function enhancedLinkChecker() {
    // CLI arguments
    const args = process.argv.slice(2); // Skip Node.js runtime and script path
    const baseUrlArg = args[0]; // First argument: The base URL
    const bypassKeyArg = args[1] || process.env.BYPASS_SECRET; // Second argument: bypassKey (fallback to env variable)
    const collectAllMetadataArg = args.includes("--collect-all-metadata"); // Extra flag

    // Settings
    const baseUrl = process.env.URL || baseUrlArg;
    const bypassKey = process.env.BYPASS_SECRET || bypassKeyArg;
    const collectAllMetadata = process.env.COLLECT_ALL_METADATA === 'true' || collectAllMetadataArg;

    console.log(`🕷 Starting crawl on: ${baseUrl}`);
    const urlHost = new URL(baseUrl).host;

    if (!baseUrl || !bypassKey) {
        console.error('❌ Both URL and BYPASS_SECRET must be set in the environment variables.');
        console.log(baseUrl, bypassKey);
        process.exit(1);
    }

    console.log(`🌐 Checking links for: ${baseUrl}`);

    // Links to check (base URL to begin with)
    const linksToCheck = [baseUrl];
    const checkedLinks = new Set();
    const brokenLinks = [];
    const metadata = [];

    // Crawl links recursively
    while (linksToCheck.length > 0) {
        const current = linksToCheck.shift(); // Get the next link to check

        if (checkedLinks.has(current)) continue; // Skip already checked links
        checkedLinks.add(current); // Mark it as checked

        try {
            console.log(`🔗 Checking: ${current}`);

            await processLink(current, urlHost, bypassKey, checkedLinks, linksToCheck, brokenLinks, collectAllMetadata, metadata);

        } catch (error) {
            console.error(`❌ Failed to fetch: ${current}`, error.message);

            brokenLinks.push({
                url: current,
                status: 'Fetch Failed',
            });
        }
    }

    // Write broken links to a structured JSON file
    const outputFileName = './broken-links.json';
    fs.writeFileSync(outputFileName, JSON.stringify(brokenLinks, null, 2), 'utf-8');
    console.warn(`📂 Broken links exported to ${outputFileName}`);

    if (collectAllMetadata) {
        // Write metadata to a structured JSON file
        const outputFileName = './all-metadata.json';
        fs.writeFileSync(outputFileName, JSON.stringify(metadata, null, 2), 'utf-8');
        console.warn(`📂 All metadata exported to ${outputFileName}`);
    }

    // Report results
    if (brokenLinks.length > 0) {
        console.error(`❌ Found ${brokenLinks.length} broken link(s).`);
        brokenLinks.forEach((link) => {
            console.error(`- ${link.url} (Status: ${link.status})`);
            if (link.metadata) {
                console.error(
                    `  Found On: ${link.metadata.foundOn}, ID: ${link.metadata.id}, Class: ${link.metadata.class}, Text: "${link.metadata.text}"`
                );
            }
        });
        process.exit(1);
    } else {
        console.log('🎉 All links checked successfully!');
        process.exit(0);
    }
})();
