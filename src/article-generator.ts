import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';
import { loadConfig } from './config';
import { upsertItem } from './storage';

// pdf-parse export
const { PDFParse } = require('pdf-parse');

const REPORTS_DIR = path.resolve(process.cwd(), 'reports');

export interface GenerateResult {
  success: boolean;
  headline?: string;
  markdown?: string;
  html?: string;
  reportFile?: string;
  error?: string;
  numPages?: number;
  wordCount?: number;
}

export async function extractTextFromPdf(pdfPath: string): Promise<{ text: string; numPages: number }> {
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse(new Uint8Array(buffer));
  const result = await parser.getText();

  const text = (result && result.text ? result.text : '').trim();
  const numPages = result && result.total ? result.total : 1;

  return { text, numPages };
}

export async function callGeminiApi(promptText: string, apiKey: string, preferredModel = 'gemini-3.8-flash'): Promise<string> {
  const models = [preferredModel, 'gemini-3.8-flash'];
  let lastError = '';

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: promptText }],
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2500,
          },
        }),
      });

      const data: any = await res.json();
      if (!res.ok) {
        lastError = data.error?.message || `HTTP ${res.status}`;
        continue; // Try next model
      }

      if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }
    } catch (e: any) {
      lastError = e.message;
    }
  }

  throw new Error(`Gemini API call failed: ${lastError}`);
}

export async function generateArticleForPdf(options: {
  itemId?: string;
  pdfPath: string;
  title?: string;
  sourceUrl?: string;
  customPrompt?: string;
}): Promise<GenerateResult> {
  const config = loadConfig();

  if (!fs.existsSync(options.pdfPath)) {
    return { success: false, error: `PDF file not found at ${options.pdfPath}` };
  }

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  try {
    const { text, numPages } = await extractTextFromPdf(options.pdfPath);

    if (text.length < 50) {
      return {
        success: false,
        error: 'PDF appears to be empty or a scanned image without embedded text. OCR is required.',
        numPages,
      };
    }

    const systemPrompt = options.customPrompt || config.journalistPrompt;
    const documentName = options.title || path.basename(options.pdfPath, '.pdf');
    const textSnippet = text.slice(0, 40000);
    const modelToUse = config.geminiModel || 'gemini-3.8-flash';

    let headline = documentName;
    let articleMarkdown = '';

    if (config.geminiApiKey) {
      if (options.customPrompt && options.customPrompt.trim() && options.customPrompt !== config.journalistPrompt) {
        // Custom prompt override if user explicitly specified a non-default custom prompt
        const fullPrompt = `${options.customPrompt}\n\nDocument Title: ${documentName}\n\nDocument Text:\n${textSnippet}`;
        articleMarkdown = await callGeminiApi(fullPrompt, config.geminiApiKey, modelToUse);
        articleMarkdown = articleMarkdown.replace(/^```(?:markdown)?\n/, '').replace(/\n```$/, '').trim();
        const headlineMatch = articleMarkdown.match(/^#\s+(.+)$/m);
        if (headlineMatch) {
          headline = headlineMatch[1].replace(/\*\*/g, '').trim();
        }
      } else {
        // Original 3-part prompt architecture from src/main.ts
        const promptTitle = `Provide a title for the following borough minutes document as though you were a local journalist writing a story in paragraph form. Be accurate.\n\n${textSnippet}`;
        const promptReport = `Summarize in paragraphs the following borough minutes document as though you were a local journalist writing a column in paragraph form. Be accurate.\n\n${textSnippet}`;
        const promptDetails = `Describe key points, potential controversial topics, and newsworthy points from the following document as though you were a local journalist writing a column in bullet points\n\n${textSnippet}`;

        const [llmHeader, llmReport, llmDetails] = await Promise.all([
          callGeminiApi(promptTitle, config.geminiApiKey, modelToUse),
          callGeminiApi(promptReport, config.geminiApiKey, modelToUse),
          callGeminiApi(promptDetails, config.geminiApiKey, modelToUse),
        ]);

        const headerClean = llmHeader
          .replace(/^#+\s*/, '')
          .replace(/\*\*/g, '')
          .replace(/[\r\n]+/g, ' ')
          .trim();

        headline = headerClean;
        articleMarkdown = `# ${headerClean}\n\n${llmReport.trim()}\n\n${llmDetails.trim()}`;
      }
    } else {
      // Mock / Local template generation if no Gemini API key configured yet
      articleMarkdown = `# ${documentName}: Meeting Highlights & Key Decisions\n\n` +
        `The governing body met recently to consider key municipal decisions, budget reviews, and policy matters. ` +
        `Based on the official meeting minutes (${numPages} pages reviewed), officials discussed regional updates and upcoming community agenda items.\n\n` +
        `### Key Points & Notable Actions\n` +
        `- Official records show the convening of regular session business and committee reports.\n` +
        `- Public notices, department reviews, and recurring administrative items were taken under consideration.\n` +
        `- Further documentation is available in the complete published minutes.\n\n` +
        `### Potential Controversies & Public Input\n` +
        `- Public comments and agenda discussions were recorded in accordance with the Open Public Meetings Act.\n\n` +
        `> **Notice:** To generate fully customized journalistic articles using Google Gemini, please enter your Gemini API key in the web app **Settings**.\n`;
    }

    // Clean up any Markdown code fences if the model wrapped output in ```markdown
    articleMarkdown = articleMarkdown.replace(/^```(?:markdown)?\n/, '').replace(/\n```$/, '').trim();

    // Ensure the markdown has a link pointing to the original PDF source
    const sourceLink = options.sourceUrl || (options.pdfPath ? path.basename(options.pdfPath) : '');
    if (sourceLink && !articleMarkdown.includes('[Source](')) {
      articleMarkdown += `\n\n[Source](${sourceLink})`;
    }

    // Save report to disk
    const pdfBasename = path.basename(options.pdfPath);
    const reportFileName = `${pdfBasename}-report.md`;
    const reportFilePath = path.join(REPORTS_DIR, reportFileName);

    fs.writeFileSync(reportFilePath, articleMarkdown, 'utf8');

    // Convert markdown to clean HTML
    const html = await marked.parse(articleMarkdown);
    const wordCount = articleMarkdown.split(/\s+/).filter(Boolean).length;

    // Update storage if itemId is provided
    if (options.itemId) {
      upsertItem({
        id: options.itemId,
        title: documentName,
        headline,
        pdfFile: pdfBasename,
        reportFile: reportFileName,
        status: 'article_generated',
        sourceUrl: options.sourceUrl,
      });
    }

    return {
      success: true,
      headline,
      markdown: articleMarkdown,
      html,
      reportFile: reportFileName,
      numPages,
      wordCount,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Generation failed: ${err.message}`,
    };
  }
}
