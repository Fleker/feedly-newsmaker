import * as fs from 'fs';
import * as path from 'path';

export interface GazetteItem {
  id: string;
  feedlyId?: string;
  title: string;
  origin?: string;
  sourceUrl?: string;
  savedDate?: string;
  pdfUrl?: string;
  pdfFile?: string;
  reportFile?: string;
  headline?: string;
  status: 'feedly_saved' | 'pdf_downloaded' | 'article_generated' | 'published';
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const DL_DIR = path.resolve(process.cwd(), 'dl');
const REPORTS_DIR = path.resolve(process.cwd(), 'reports');

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DL_DIR)) fs.mkdirSync(DL_DIR, { recursive: true });
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

export function loadItems(): GazetteItem[] {
  ensureDirectories();
  if (!fs.existsSync(ITEMS_FILE)) {
    const initialItems = scanExistingFiles();
    saveItems(initialItems);
    return initialItems;
  }

  try {
    const raw = fs.readFileSync(ITEMS_FILE, 'utf8');
    const items = JSON.parse(raw) as GazetteItem[];
    // Re-sync with disk to catch any manually added files
    const updated = syncWithDisk(items);
    if (updated.length !== items.length) {
      saveItems(updated);
    }
    return updated;
  } catch (e) {
    console.error('Failed to parse items.json, rescanning files:', e);
    const scanned = scanExistingFiles();
    saveItems(scanned);
    return scanned;
  }
}

export function saveItems(items: GazetteItem[]): void {
  ensureDirectories();
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2), 'utf8');
}

export function getItem(id: string): GazetteItem | undefined {
  const items = loadItems();
  return items.find(i => i.id === id);
}

export function upsertItem(item: Partial<GazetteItem> & { id: string; title: string }): GazetteItem {
  const items = loadItems();
  const index = items.findIndex(i => i.id === item.id);
  const now = new Date().toISOString();

  let merged: GazetteItem;
  if (index >= 0) {
    merged = {
      ...items[index],
      ...item,
      updatedAt: now,
    };
    items[index] = merged;
  } else {
    merged = {
      id: item.id,
      title: item.title,
      origin: item.origin || '',
      sourceUrl: item.sourceUrl || '',
      savedDate: item.savedDate || now,
      pdfUrl: item.pdfUrl || '',
      pdfFile: item.pdfFile,
      reportFile: item.reportFile,
      headline: item.headline,
      status: item.status || 'feedly_saved',
      createdAt: now,
      updatedAt: now,
    };
    items.unshift(merged);
  }

  saveItems(items);
  return merged;
}

export function scanExistingFiles(): GazetteItem[] {
  ensureDirectories();
  const items: GazetteItem[] = [];
  const now = new Date().toISOString();

  const reportFiles = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('-report.md') || f.endsWith('.md'));
  const dlFiles = new Set(fs.readdirSync(DL_DIR).filter(f => f.endsWith('.pdf')));

  const processedReports = new Set<string>();

  // Process reports first
  for (const rep of reportFiles) {
    processedReports.add(rep);
    const repPath = path.join(REPORTS_DIR, rep);
    let headline = '';
    let sourceUrl = '';

    try {
      const content = fs.readFileSync(repPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (!headline && line.startsWith('# ')) {
          headline = line.replace(/^#\s*/, '').replace(/\*\*/g, '').trim();
        }
        const sourceMatch = line.match(/\[Source\]\(([^)]+)\)/i);
        if (sourceMatch) {
          sourceUrl = sourceMatch[1];
        }
      }
    } catch (e) {
      // Ignore read errors
    }

    // Determine matching PDF filename
    let pdfFile = rep.replace(/-report\.md$/, '');
    if (!pdfFile.endsWith('.pdf') && fs.existsSync(path.join(DL_DIR, pdfFile + '.pdf'))) {
      pdfFile = pdfFile + '.pdf';
    }

    const hasPdf = fs.existsSync(path.join(DL_DIR, pdfFile));
    const title = headline || pdfFile.replace(/\.pdf$/, '');
    const id = Buffer.from(rep).toString('base64url');

    items.push({
      id,
      title,
      origin: 'Local Archive',
      sourceUrl: sourceUrl || undefined,
      savedDate: now,
      pdfFile: hasPdf ? pdfFile : undefined,
      reportFile: rep,
      headline: headline || title,
      status: 'article_generated',
      createdAt: now,
      updatedAt: now,
    });
  }

  // Next process standalone PDFs in dl/ that do not have reports yet
  for (const pdf of dlFiles) {
    const expectedRep1 = `${pdf}-report.md`;
    const expectedRep2 = pdf.replace(/\.pdf$/, '-report.md');
    if (processedReports.has(expectedRep1) || processedReports.has(expectedRep2)) {
      continue;
    }

    const id = Buffer.from(pdf).toString('base64url');
    items.push({
      id,
      title: pdf.replace(/\.pdf$/, ''),
      origin: 'Local Download',
      savedDate: now,
      pdfFile: pdf,
      status: 'pdf_downloaded',
      createdAt: now,
      updatedAt: now,
    });
  }

  return items;
}

function syncWithDisk(items: GazetteItem[]): GazetteItem[] {
  const currentScanned = scanExistingFiles();
  const existingIds = new Set(items.map(i => i.id));

  for (const scanned of currentScanned) {
    if (!existingIds.has(scanned.id)) {
      items.push(scanned);
    }
  }

  return items;
}
