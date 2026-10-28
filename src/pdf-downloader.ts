import * as fs from 'fs';
import * as path from 'path';

const DL_DIR = path.resolve(process.cwd(), 'dl');

export function sanitizePdfFileName(raw: string): string {
  let name = raw.trim();

  // Strip query parameters
  if (name.includes('?')) {
    const parts = name.split('?');
    // Check if filename parameter is in query
    const match = name.match(/FileName=([^&]+)/i);
    if (match && match[1]) {
      name = decodeURIComponent(match[1]);
    } else {
      name = parts[0];
    }
  }

  // Extract basename if it looks like a path
  if (name.includes('/')) {
    name = path.basename(name);
  }

  // Remove illegal characters
  name = name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name.toLowerCase().endsWith('.pdf')) {
    name += '.pdf';
  }

  return name;
}

export function getUrlDownloadCandidates(rawUrl: string): string[] {
  const candidates: string[] = [];
  const add = (u: string) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };

  add(rawUrl);

  // 1. Strip trailing query params that start with a second question mark
  let clean = rawUrl;
  const doubleQuestion = clean.indexOf('?', clean.indexOf('?') + 1);
  if (doubleQuestion !== -1) {
    clean = clean.substring(0, doubleQuestion);
    add(clean);
  }

  // 2. Check for double HTTP/HTTPS (Revize CMS prepending host)
  const nestedMatch = clean.match(/https?:\/\/[^\/]+(?:\/[^\/]+)*\/(https?:\/\/.*)/i);
  if (nestedMatch) {
    add(nestedMatch[1]);
  }

  // 3. Encode spaces properly
  candidates.slice().forEach(c => {
    add(c.replace(/\s+/g, '%20'));
  });

  // 4. Try stripping all query params
  candidates.slice().forEach(c => {
    if (c.includes('?')) {
      add(c.split('?')[0]);
    }
  });

  // 5. Revize CMS hostname swaps:
  // e.g. https://cms5.revize.com/revize/pitman/Minutes/... <-> https://www.pitman.org/Minutes/...
  candidates.slice().forEach(c => {
    const revizeMatch = c.match(/https?:\/\/cms\d*\.revize\.com\/revize\/([^\/]+)\/(.*)/i);
    if (revizeMatch) {
      const town = revizeMatch[1];
      const rest = revizeMatch[2];
      add(`https://www.${town}.org/${rest}`);
      add(`https://www.${town}.gov/${rest}`);
    }
  });

  return candidates;
}

export async function downloadPdf(
  url: string,
  preferredName?: string
): Promise<{ success: boolean; fileName?: string; filePath?: string; sizeBytes?: number; error?: string }> {
  if (!fs.existsSync(DL_DIR)) {
    fs.mkdirSync(DL_DIR, { recursive: true });
  }

  const candidates = getUrlDownloadCandidates(url);
  let lastError = '';

  for (const candidateUrl of candidates) {
    try {
      const res = await fetch(candidateUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/pdf,application/octet-stream,*/*',
        },
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status} ${res.statusText}`;
        continue;
      }

      const contentType = res.headers.get('content-type') || '';
      const contentDisposition = res.headers.get('content-disposition') || '';

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Verify it's not an HTML error page masquerading as PDF
      if (buffer.length < 50 || (!buffer.slice(0, 5).toString().startsWith('%PDF-') && contentType.includes('text/html'))) {
        lastError = 'Response was HTML instead of PDF';
        continue;
      }

      // Determine filename
      let chosenName = '';
      if (preferredName) {
        chosenName = sanitizePdfFileName(preferredName);
      } else if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
        if (match && match[1]) {
          chosenName = sanitizePdfFileName(decodeURIComponent(match[1]));
        }
      }

      if (!chosenName) {
        try {
          const parsedUrl = new URL(candidateUrl);
          chosenName = sanitizePdfFileName(path.basename(parsedUrl.pathname) || 'download.pdf');
        } catch {
          chosenName = `document-${Date.now()}.pdf`;
        }
      }

      const filePath = path.join(DL_DIR, chosenName);
      fs.writeFileSync(filePath, buffer);

      return {
        success: true,
        fileName: chosenName,
        filePath,
        sizeBytes: buffer.length,
      };
    } catch (err: any) {
      lastError = err.message;
    }
  }

  return {
    success: false,
    error: `Failed to download: ${lastError}`,
  };
}

export function listDownloadedPdfs(): Array<{ fileName: string; sizeBytes: number; modifiedAt: string }> {
  if (!fs.existsSync(DL_DIR)) return [];

  const files = fs.readdirSync(DL_DIR).filter(f => f.endsWith('.pdf'));
  return files.map(file => {
    const fullPath = path.join(DL_DIR, file);
    const stat = fs.statSync(fullPath);
    return {
      fileName: file,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  }).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
