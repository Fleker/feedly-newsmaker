import { marked } from 'marked';
import { loadConfig } from './config';

export interface SubstackExportData {
  headline: string;
  markdown: string;
  html: string;
  plainText: string;
  substackNewPostUrl: string;
  publishUrl: string;
}

export function prepareSubstackExport(markdown: string, customTitle?: string, sourceUrl?: string): SubstackExportData {
  const config = loadConfig();

  // Extract headline
  let headline = customTitle || '';
  if (!headline) {
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      headline = titleMatch[1].replace(/\*\*/g, '').trim();
    } else {
      headline = 'New Gazette Newsletter Story';
    }
  }

  let finalMarkdown = markdown.trim();
  // Ensure markdown link pointing to original PDF source is included
  if (sourceUrl && !finalMarkdown.includes('[Source](')) {
    finalMarkdown += `\n\n[Source](${sourceUrl})`;
  }

  const rawHtml = marked.parse(finalMarkdown) as string;

  // Ensure Substack publication publish URL
  let pubUrl = config.substackUrl.trim().replace(/\/+$/, '');
  if (!pubUrl.startsWith('http://') && !pubUrl.startsWith('https://')) {
    pubUrl = `https://${pubUrl}`;
  }

  const substackNewPostUrl = `${pubUrl}/publish/post`;

  return {
    headline,
    markdown: finalMarkdown,
    html: rawHtml,
    plainText: finalMarkdown.replace(/[#*_`]/g, '').trim(),
    substackNewPostUrl,
    publishUrl: substackNewPostUrl,
  };
}
