
import fetch from 'node-fetch'
import { JSDOM } from 'jsdom';
import fs from 'fs';

(async function enhancedLinkChecker() {
    // Your starting URL
    const baseUrl = process.env.URL;
    const bypassKey = process.env.BYPASS_SECRET;
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

    // Helper: Normalize links (ignore fragments, etc.)
    const normalizeUrl = (url) => {
        try {
            return new URL(url).toString().replace(/#.*$/, ''); // Remove fragments like #anchor
        } catch {
            return null; // Skip invalid/unsupported URLs
        }
    };

    // Helper: Extract metadata for a link (id, class, text, URL found on)
    const extractMetaData = (linkElement, pageUrl) => ({
        id: linkElement.getAttribute('id') || null,
        class: linkElement.getAttribute('class') || null,
        text: linkElement.textContent.trim() || null,
    });

    // Helper: Parse HTML and extract links with metadata
    const extractLinksFromHtml = (html, pageUrl) => {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const links = Array.from(document.querySelectorAll('a[href]')); // All anchor tags with href

        return links.map((anchor) => ({
            url: normalizeUrl(new URL(anchor.href, pageUrl).href), // Resolve relative URLs
            meta: extractMetaData(anchor, pageUrl), // Extract metadata
        }));
    };

    // Crawl links recursively
    while (linksToCheck.length > 0) {
        const current = linksToCheck.shift(); // Get the next link to check

        if (checkedLinks.has(current)) continue; // Skip already checked links
        checkedLinks.add(current); // Mark it as checked

        const { JSDOM } = require('jsdom');

// Inside the try block where you are processing `response`
        try {
            console.log(`🔗 Checking: ${current}`);

            const currentHost = new URL(current).host; // Extract the host of the current link
            if (currentHost !== urlHost) {
                console.warn(`⏩ Skipping external link: ${current}`);
                continue;
            }

            const response = await fetch(current, {
                headers: { 'x-vercel-protection-bypass': bypassKey },
                redirect: 'follow',
            });

            if (!response.ok) {
                console.error(`❌ Broken: ${current} (${response.status})`);

                let elementMetadata = null;

                // Parse response.body as HTML to potentially find the broken link
                if (response.headers.get('content-type')?.includes('text/html')) {
                    const html = await response.text();
                    const dom = new JSDOM(html);
                    const document = dom.window.document;

                    // Try locating the link element related to the broken URL
                    const brokenLinkElement = document.querySelector(`a[href="${current}"]`);
                    elementMetadata = brokenLinkElement
                        ? extractMetaData(brokenLinkElement, current)
                        : null;

                    // console.log("elementMetadata", elementMetadata, "brokenLinkElement", brokenLinkElement, "current", current, "html", html);
                }

                brokenLinks.push({
                    url: current,
                    status: response.status,
                });
                continue;
            }

            // Parse HTML to find more links if this is an HTML response
            if (response.headers.get('content-type')?.includes('text/html')) {
                const html = await response.text();
                const links = extractLinksFromHtml(html, current);

                for (const { url, meta } of links) {
                    if (!checkedLinks.has(url)) {
                        linksToCheck.push(url);
                    }
                }
            }
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
