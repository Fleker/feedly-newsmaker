import express, { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { marked } from 'marked';
import { loadConfig, saveConfig, getPublicConfig, importFromObsidian } from './config';
import { fetchSavedItems, testFeedlyConnection, findPdfLinksInWebPage } from './feedly';
import { downloadPdf, listDownloadedPdfs, sanitizePdfFileName } from './pdf-downloader';
import { generateArticleForPdf, callGeminiApi } from './article-generator';
import { loadItems, getItem, upsertItem, scanExistingFiles, GazetteItem } from './storage';
import { prepareSubstackExport } from './substack-helper';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const DL_DIR = path.resolve(process.cwd(), 'dl');
const REPORTS_DIR = path.resolve(process.cwd(), 'reports');

// Serve static assets
app.use(express.static(PUBLIC_DIR));
app.use('/dl', express.static(DL_DIR));

// Scan and initialize storage on boot
scanExistingFiles();

// -------------------------------------------------------------
// Health & Stats
// -------------------------------------------------------------
app.get('/api/status', (req: Request, res: Response) => {
  const items = loadItems();
  const pdfs = listDownloadedPdfs();

  const stats = {
    totalItems: items.length,
    feedlySaved: items.filter(i => i.status === 'feedly_saved').length,
    pdfDownloaded: items.filter(i => i.status === 'pdf_downloaded').length,
    articleGenerated: items.filter(i => i.status === 'article_generated').length,
    published: items.filter(i => i.status === 'published').length,
    localPdfsCount: pdfs.length,
  };

  res.json({ ok: true, stats, time: new Date().toISOString() });
});

// -------------------------------------------------------------
// Configuration
// -------------------------------------------------------------
app.get('/api/config', (req: Request, res: Response) => {
  res.json(getPublicConfig());
});

app.post('/api/config', (req: Request, res: Response) => {
  try {
    const { feedlyAccessToken, feedlyUserId, geminiApiKey, geminiModel, substackUrl, journalistPrompt, port } = req.body;
    const updates: Record<string, any> = {};

    if (feedlyAccessToken !== undefined) updates.feedlyAccessToken = feedlyAccessToken.trim();
    if (feedlyUserId !== undefined) updates.feedlyUserId = feedlyUserId.trim();
    if (geminiApiKey !== undefined) updates.geminiApiKey = geminiApiKey.trim();
    if (geminiModel !== undefined) updates.geminiModel = geminiModel.trim();
    if (substackUrl !== undefined) updates.substackUrl = substackUrl.trim();
    if (journalistPrompt !== undefined) updates.journalistPrompt = journalistPrompt;
    if (port !== undefined && Number(port)) updates.port = Number(port);

    saveConfig(updates);
    res.json({ success: true, config: getPublicConfig() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/config/import-obsidian', (req: Request, res: Response) => {
  const result = importFromObsidian();
  if (result.success) {
    res.json({ success: true, message: result.message, config: getPublicConfig() });
  } else {
    res.status(400).json({ success: false, error: result.message });
  }
});

app.post('/api/config/test-feedly', async (req: Request, res: Response) => {
  const config = loadConfig();
  const token = req.body.feedlyAccessToken || config.feedlyAccessToken;
  const userId = req.body.feedlyUserId || config.feedlyUserId;

  const result = await testFeedlyConnection(token, userId);
  res.json(result);
});

app.post('/api/config/test-gemini', async (req: Request, res: Response) => {
  const config = loadConfig();
  const key = req.body.geminiApiKey || config.geminiApiKey;
  const model = req.body.geminiModel || config.geminiModel || 'gemini-3.8-flash';

  if (!key) {
    return res.status(400).json({ success: false, message: 'Please provide a Gemini API Key to test.' });
  }

  try {
    const response = await callGeminiApi('Respond with exactly "Gemini connection successful!" and nothing else.', key, model);
    res.json({ success: true, message: response.trim() });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// Feedly Saved Items & Link Extraction
// -------------------------------------------------------------
app.get('/api/feedly/saved', async (req: Request, res: Response) => {
  const config = loadConfig();
  const count = parseInt(req.query.count as string || '50', 10);

  const result = await fetchSavedItems(config, count);
  if (!result.success || !result.items) {
    return res.status(400).json(result);
  }

  const existingItems = loadItems();
  const existingMap = new Map(existingItems.map(i => [i.feedlyId || i.id, i]));

  // Augment with existing status
  const enrichedItems = result.items.map(item => {
    const existing = existingMap.get(item.id);
    return {
      ...item,
      existingStatus: existing ? existing.status : null,
      localPdfFile: existing ? existing.pdfFile : null,
      localReportFile: existing ? existing.reportFile : null,
      existingId: existing ? existing.id : null,
    };
  });

  res.json({ success: true, items: enrichedItems });
});

app.post('/api/feedly/sync', async (req: Request, res: Response) => {
  const config = loadConfig();
  const result = await fetchSavedItems(config, 100);

  if (!result.success || !result.items) {
    return res.status(400).json(result);
  }

  let addedCount = 0;
  for (const item of result.items) {
    const safeId = Buffer.from(item.id).toString('base64url');
    upsertItem({
      id: safeId,
      feedlyId: item.id,
      title: item.title,
      origin: item.originTitle,
      sourceUrl: item.url,
      savedDate: new Date(item.published).toISOString(),
      pdfUrl: item.pdfUrl,
      status: 'feedly_saved',
    });
    addedCount++;
  }

  res.json({ success: true, synced: addedCount });
});

app.post('/api/feedly/inspect-page', async (req: Request, res: Response) => {
  const { pageUrl } = req.body;
  if (!pageUrl) {
    return res.status(400).json({ success: false, error: 'pageUrl is required' });
  }

  const pdfLinks = await findPdfLinksInWebPage(pageUrl);
  res.json({ success: true, pdfLinks });
});

// -------------------------------------------------------------
// PDF Downloader
// -------------------------------------------------------------
app.post('/api/pdf/download', async (req: Request, res: Response) => {
  const { itemId, url, preferredName } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  const result = await downloadPdf(url, preferredName);
  if (!result.success || !result.fileName) {
    return res.status(400).json(result);
  }

  if (itemId) {
    upsertItem({
      id: itemId,
      title: preferredName || result.fileName,
      pdfFile: result.fileName,
      pdfUrl: url,
      status: 'pdf_downloaded',
    });
  } else {
    const newId = Buffer.from(result.fileName).toString('base64url');
    upsertItem({
      id: newId,
      title: result.fileName.replace(/\.pdf$/, ''),
      pdfFile: result.fileName,
      pdfUrl: url,
      status: 'pdf_downloaded',
    });
  }

  res.json(result);
});

app.get('/api/pdf/list', (req: Request, res: Response) => {
  const list = listDownloadedPdfs();
  res.json({ success: true, pdfs: list });
});

// -------------------------------------------------------------
// Article Management & Generation
// -------------------------------------------------------------
app.get('/api/articles', (req: Request, res: Response) => {
  let items = loadItems();

  const status = req.query.status as string;
  const q = (req.query.q as string || '').toLowerCase().trim();

  if (status) {
    items = items.filter(i => i.status === status);
  }

  if (q) {
    items = items.filter(i =>
      (i.title && i.title.toLowerCase().includes(q)) ||
      (i.headline && i.headline.toLowerCase().includes(q)) ||
      (i.origin && i.origin.toLowerCase().includes(q))
    );
  }

  res.json({ success: true, items });
});

app.get('/api/articles/:id', async (req: Request, res: Response) => {
  const item = getItem(req.params.id as string);
  if (!item) {
    return res.status(404).json({ success: false, error: 'Item not found' });
  }

  let markdown = '';
  let html = '';

  if (item.reportFile) {
    const reportPath = path.join(REPORTS_DIR, item.reportFile);
    if (fs.existsSync(reportPath)) {
      markdown = fs.readFileSync(reportPath, 'utf8');
      html = (await marked.parse(markdown)) as string;
    }
  }

  return res.json({
    success: true,
    item,
    markdown,
    html,
  });
});

app.put('/api/articles/:id', async (req: Request, res: Response) => {
  const item = getItem(req.params.id as string);
  if (!item) {
    return res.status(404).json({ success: false, error: 'Item not found' });
  }

  const { headline, markdown } = req.body;

  if (markdown !== undefined && item.reportFile) {
    const reportPath = path.join(REPORTS_DIR, item.reportFile);
    fs.writeFileSync(reportPath, markdown, 'utf8');
  }

  const updated = upsertItem({
    id: item.id,
    title: item.title,
    headline: headline || item.headline,
  });

  const updatedHtml = markdown ? (await marked.parse(markdown)) as string : '';

  return res.json({ success: true, item: updated, html: updatedHtml });
});

app.post('/api/articles/:id/generate', async (req: Request, res: Response) => {
  const item = getItem(req.params.id as string);
  if (!item) {
    return res.status(404).json({ success: false, error: 'Item not found' });
  }

  let pdfPath = '';
  if (item.pdfFile) {
    pdfPath = path.join(DL_DIR, item.pdfFile);
  }

  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return res.status(400).json({
      success: false,
      error: `PDF file not found for item "${item.title}". Please download the PDF first.`,
    });
  }

  const result = await generateArticleForPdf({
    itemId: item.id,
    pdfPath,
    title: item.title,
    sourceUrl: req.body.sourceUrl || item.pdfUrl || item.sourceUrl,
    customPrompt: req.body.customPrompt,
  });

  if (!result.success) {
    return res.status(500).json(result);
  }

  return res.json(result);
});

app.post('/api/articles/batch-generate', async (req: Request, res: Response) => {
  const { itemIds } = req.body;
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ success: false, error: 'itemIds array is required' });
  }

  const results: Record<string, any> = {};

  for (const id of itemIds) {
    const item = getItem(id);
    if (!item || !item.pdfFile) {
      results[id] = { success: false, error: 'Item or PDF not found' };
      continue;
    }

    const pdfPath = path.join(DL_DIR, item.pdfFile);
    if (!fs.existsSync(pdfPath)) {
      results[id] = { success: false, error: 'PDF file missing on disk' };
      continue;
    }

    const gen = await generateArticleForPdf({
      itemId: item.id,
      pdfPath,
      title: item.title,
      sourceUrl: item.pdfUrl || item.sourceUrl,
    });

    results[id] = gen;
  }

  return res.json({ success: true, results });
});

app.post('/api/articles/:id/publish', (req: Request, res: Response) => {
  const item = getItem(req.params.id as string);
  if (!item) {
    return res.status(404).json({ success: false, error: 'Item not found' });
  }

  const updated = upsertItem({
    id: item.id,
    title: item.title,
    status: 'published',
    publishedAt: new Date().toISOString(),
  });

  return res.json({ success: true, item: updated });
});

app.get('/api/articles/:id/substack-export', (req: Request, res: Response) => {
  const item = getItem(req.params.id as string);
  if (!item || !item.reportFile) {
    return res.status(404).json({ success: false, error: 'Article report not found' });
  }

  const reportPath = path.join(REPORTS_DIR, item.reportFile);
  if (!fs.existsSync(reportPath)) {
    return res.status(404).json({ success: false, error: 'Report file missing on disk' });
  }

  const markdown = fs.readFileSync(reportPath, 'utf8');
  const exportData = prepareSubstackExport(markdown, item.headline, item.pdfUrl || item.sourceUrl);

  return res.json({ success: true, exportData });
});

// -------------------------------------------------------------
// Start Server
// -------------------------------------------------------------
const config = loadConfig();
const desiredPort = config.port || 3000;

function startServer(port: number) {
  const server = app.listen(port, () => {
    console.log(`====================================================`);
    console.log(` Gloucester Gazette Feedly -> Substack Web App`);
    console.log(` Running locally at: http://localhost:${port}`);
    console.log(`====================================================`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(desiredPort);
