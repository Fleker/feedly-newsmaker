import * as cheerio from 'cheerio';
import * as path from 'path';
import { AppConfig } from './config';

export interface FeedlySavedItem {
  id: string;
  title: string;
  originTitle: string;
  url: string;
  published: number;
  pdfUrl?: string;
  summary?: string;
}

export function normalizeMunicipalUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  let url = rawUrl.trim();

  // Strip duplicate question mark queries like ?Tue Oct 13 2026-Reg. Minutes
  const doubleQuestion = url.indexOf('?', url.indexOf('?') + 1);
  if (doubleQuestion !== -1) {
    url = url.substring(0, doubleQuestion);
  }

  // Check if a second http(s):// is embedded in the path (e.g. Revize CMS double prefix)
  const doubleHttpMatch = url.match(/https?:\/\/[^\/]+(?:\/[^\/]+)*\/(https?:\/\/.*)/i);
  if (doubleHttpMatch) {
    url = doubleHttpMatch[1];
  }

  // Ensure spaces are encoded
  url = url.replace(/\s+/g, '%20');

  return url;
}

export async function testFeedlyConnection(token: string, userId: string): Promise<{ success: boolean; message: string; profile?: any }> {
  if (!token || !userId) {
    return { success: false, message: 'Feedly Access Token and User ID are required.' };
  }

  try {
    const res = await fetch('https://cloud.feedly.com/v3/profile', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    const data: any = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        return {
          success: false,
          message: 'Access Token expired or invalid. Please generate a new developer token at https://feedly.com/v3/auth/dev',
        };
      }
      return {
        success: false,
        message: data.errorMessage || `Feedly error: HTTP ${res.status}`,
      };
    }

    return {
      success: true,
      message: `Connected successfully as ${data.email || data.givenName || userId}!`,
      profile: data,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Network error connecting to Feedly: ${err.message}`,
    };
  }
}

export async function fetchSavedItems(config: AppConfig, count = 50): Promise<{ success: boolean; items?: FeedlySavedItem[]; error?: string }> {
  if (!config.feedlyAccessToken || !config.feedlyUserId) {
    return {
      success: false,
      error: 'Feedly is not configured. Please add your Feedly Token and User ID in Settings.',
    };
  }

  try {
    const streamId = encodeURIComponent(`user/${config.feedlyUserId}/tag/global.saved`);
    const url = `https://cloud.feedly.com/v3/streams/contents?streamId=${streamId}&count=${count}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.feedlyAccessToken}`,
        Accept: 'application/json',
      },
    });

    const data: any = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        return {
          success: false,
          error: 'Your Feedly Access Token has expired. Please grab a new developer token from https://feedly.com/v3/auth/dev and update Settings.',
        };
      }
      return {
        success: false,
        error: data.errorMessage || `Feedly API error: HTTP ${res.status}`,
      };
    }

    const items: FeedlySavedItem[] = (data.items || []).map((item: any) => {
      let webUrl = '';
      if (item.alternate && item.alternate.length > 0) {
        webUrl = normalizeMunicipalUrl(item.alternate[0].href);
      } else if (item.canonicalUrl) {
        webUrl = normalizeMunicipalUrl(item.canonicalUrl);
      } else if (item.originId) {
        webUrl = normalizeMunicipalUrl(item.originId);
      }

      // Check if URL is directly a PDF
      let pdfUrl: string | undefined = undefined;
      if (webUrl && (webUrl.toLowerCase().endsWith('.pdf') || webUrl.includes('.pdf?'))) {
        pdfUrl = webUrl;
      } else if (item.enclosure && Array.isArray(item.enclosure)) {
        const pdfEnc = item.enclosure.find((e: any) => e.type === 'application/pdf' || (e.href && e.href.toLowerCase().endsWith('.pdf')));
        if (pdfEnc) pdfUrl = normalizeMunicipalUrl(pdfEnc.href);
      }

      let summary = '';
      if (item.summary && item.summary.content) {
        summary = item.summary.content.replace(/<[^>]+>/g, '').trim().slice(0, 250);
      } else if (item.content && item.content.content) {
        summary = item.content.content.replace(/<[^>]+>/g, '').trim().slice(0, 250);
      }

      return {
        id: item.id,
        title: item.title || 'Untitled Feedly Item',
        originTitle: item.origin?.title || 'Feedly Feed',
        url: webUrl,
        published: item.published || item.crawled || Date.now(),
        pdfUrl,
        summary,
      };
    });

    return { success: true, items };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to fetch saved items: ${err.message}`,
    };
  }
}

export async function findPdfLinksInWebPage(pageUrl: string): Promise<{ text: string; url: string }[]> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} when fetching webpage`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const pdfLinks: { text: string; url: string }[] = [];
    const seenUrls = new Set<string>();

    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const trimmedHref = href.trim();
      const isPdf =
        trimmedHref.toLowerCase().endsWith('.pdf') ||
        trimmedHref.toLowerCase().includes('.pdf?') ||
        trimmedHref.includes('filedownload.ashx') ||
        trimmedHref.includes('/handlers/filedownload');

      if (isPdf) {
        try {
          const absoluteUrl = new URL(trimmedHref, pageUrl).href;
          if (!seenUrls.has(absoluteUrl)) {
            seenUrls.add(absoluteUrl);
            const linkText = $(el).text().replace(/\s+/g, ' ').trim() || path.basename(trimmedHref);
            pdfLinks.push({
              text: linkText,
              url: absoluteUrl,
            });
          }
        } catch {
          // Ignore URL parse errors
        }
      }
    });

    return pdfLinks;
  } catch (err: any) {
    console.error(`Error finding PDF links on ${pageUrl}:`, err.message);
    return [];
  }
}
