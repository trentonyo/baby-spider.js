import fetch from "node-fetch";
import {JSDOM} from "jsdom";

export const normalizeUrl = (url) => {
    try {
        return new URL(url).toString().replace(/#.*$/, ''); // Remove fragments like #anchor
    } catch {
        return null; // Skip invalid/unsupported URLs
    }
};

export const extractMetaData = (linkElement, pageUrl) => ({
    id: linkElement.getAttribute('id') || null,
    class: linkElement.getAttribute('class') || null,
    text: linkElement.textContent.trim() || null,
});

export const extractLinksFromHtml = (html, pageUrl) => {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const links = Array.from(document.querySelectorAll('a[href]')); // All anchor tags with href

    return links.map((anchor) => ({
        url: normalizeUrl(new URL(anchor.href, pageUrl).href), // Resolve relative URLs
        meta: extractMetaData(anchor, pageUrl), // Extract metadata
    }));
};

export async function processLink(current, urlHost, bypassKey, checkedLinks, linksToCheck, brokenLinks, collectAllMetadata = false, metadata = []) {
    const currentHost = new URL(current).host; // Extract the host of the current link
    if (currentHost !== urlHost) {
        console.warn(`⏩ Skipping external link: ${current}`);
        return;
    }

    try {
        const response = await fetch(current, {
            headers: {'x-vercel-protection-bypass': bypassKey},
            redirect: 'follow',
        });

        let html = null
        let dom = null
        let document = null

        if (collectAllMetadata || !response.ok) {
            // Parse response.body as HTML to potentially find the broken link
            if (response.headers.get('content-type')?.includes('text/html')) {
                html = await response.text();
                dom = new JSDOM(html);
                document = dom.window.document;

                let elementMetadata = null;

                // Try locating the link element related to the broken URL
                const brokenLinkElement = document.querySelector(`a[href="${current}"]`);
                elementMetadata = brokenLinkElement
                    ? extractMetaData(brokenLinkElement, current)
                    : null;
            }
        }

        if (!response.ok) {
            console.error(`❌ Broken: ${current} (${response.status})`);

            brokenLinks.push({
                url: current,
                status: response.status,
            });
            return;
        }

        if (collectAllMetadata) {

            const pageMetadata = {};
            if (document) {
                const metaTags = document.querySelectorAll('head meta');
                metaTags.forEach((meta) => {
                    const key = meta.getAttribute('name') || meta.getAttribute('property');
                    const value = meta.getAttribute('content');
                    if (key && value) {
                        pageMetadata[key] = value;
                    }
                });
            }

            // Check for Structured Data (e.g. JSON-LD scripts)
            if (document) {
                const structuredData = [];
                const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
                jsonLdScripts.forEach((script) => {
                    try {
                        const data = JSON.parse(script.textContent);
                        if (data) {
                            structuredData.push(data);
                        }
                    } catch (e) {
                        console.warn('⚠️ Failed to parse structured data JSON:', e.message);
                    }
                });

                if (structuredData.length > 0) {
                    pageMetadata.structuredData = structuredData;
                }
            }
            
            metadata.push({
                url: current,
                status: response.status,
                pageMetadata,
            })
        }

        // Parse HTML to find more links if this is an HTML response
        if (response.headers.get('content-type')?.includes('text/html')) {
            const links = extractLinksFromHtml(html, current);

            for (const {url, meta} of links) {
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

