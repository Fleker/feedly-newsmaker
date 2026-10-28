import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const ENV_PATH = path.resolve(process.cwd(), '.env');
const OBSIDIAN_ENV_PATH = path.resolve(process.env.HOME || '', 'dev/feedly-for-obsidian/.env');

export interface AppConfig {
  feedlyAccessToken: string;
  feedlyUserId: string;
  geminiApiKey: string;
  geminiModel: string;
  vertexProjectId: string;
  substackUrl: string;
  journalistPrompt: string;
  port: number;
}

const DEFAULT_PROMPT = `You are an expert local investigative journalist reporting on municipal government, town council, school board, and regional authority meetings.

Given the text of the meeting minutes or agenda provided below, generate a high-quality newspaper column.

Requirements:
1. Output format:
# [Catchy, Accurate, Journalistic Headline]

[Summary / Opening Column in 2-3 engaging, well-written paragraphs covering the main actions, ordinances, budget approvals, appointments, and discussions]

### Key Points & Notable Actions
- [Bullet points of important decisions, expenditures, and policy changes]

### Potential Controversies & Public Input
- [Bullet points of contentious topics, public comments, concerns, or dissenting votes]

### Follow-up & Sources
- [Date of meeting, governing body name, and recommendations for community follow-up]

2. Tone: Fair, journalistic, objective, engaging, and clear for local community residents. Avoid bureaucratic jargon where simple terms work.`;

export function loadConfig(): AppConfig {
  if (fs.existsSync(ENV_PATH)) {
    dotenv.config({ path: ENV_PATH, override: true });
  }

  return {
    feedlyAccessToken: process.env.FEEDLY_ACCESS_TOKEN || '',
    feedlyUserId: process.env.FEEDLY_USER_ID || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    vertexProjectId: process.env.VERTEX_PROJECT_ID || 'gloucester-gazette',
    substackUrl: process.env.SUBSTACK_URL || 'https://nickfelker.substack.com',
    journalistPrompt: process.env.JOURNALIST_PROMPT || DEFAULT_PROMPT,
    port: parseInt(process.env.PORT || '3000', 10),
  };
}

export function saveConfig(updates: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const updated: AppConfig = {
    ...current,
    ...updates,
  };

  // If updates passed empty string or undefined for token or apiKey, preserve existing key
  if (!updates.feedlyAccessToken && current.feedlyAccessToken) {
    updated.feedlyAccessToken = current.feedlyAccessToken;
  }
  if (!updates.geminiApiKey && current.geminiApiKey) {
    updated.geminiApiKey = current.geminiApiKey;
  }
  if (!updates.geminiModel) {
    updated.geminiModel = current.geminiModel || 'gemini-3.8-flash';
  }

  const lines = [
    `# Gloucester Gazette Feedly -> Substack Configuration`,
    `FEEDLY_ACCESS_TOKEN=${updated.feedlyAccessToken}`,
    `FEEDLY_USER_ID=${updated.feedlyUserId}`,
    `GEMINI_API_KEY=${updated.geminiApiKey}`,
    `GEMINI_MODEL=${updated.geminiModel}`,
    `VERTEX_PROJECT_ID=${updated.vertexProjectId}`,
    `SUBSTACK_URL=${updated.substackUrl}`,
    `PORT=${updated.port}`,
    `# Prompt can be stored with escaped newlines`,
    `JOURNALIST_PROMPT=${JSON.stringify(updated.journalistPrompt)}`,
  ];

  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8');

  // Reload into process.env
  dotenv.config({ path: ENV_PATH, override: true });

  return updated;
}

export function getPublicConfig(): Record<string, any> {
  const cfg = loadConfig();
  const mask = (str: string) => {
    if (!str) return '';
    if (str.length <= 8) return '********';
    return `${str.slice(0, 4)}...${str.slice(-4)}`;
  };

  return {
    feedlyConfigured: Boolean(cfg.feedlyAccessToken && cfg.feedlyUserId),
    feedlyAccessToken: cfg.feedlyAccessToken,
    feedlyAccessTokenMasked: mask(cfg.feedlyAccessToken),
    feedlyUserId: cfg.feedlyUserId,
    geminiConfigured: Boolean(cfg.geminiApiKey),
    geminiApiKey: cfg.geminiApiKey,
    geminiApiKeyMasked: mask(cfg.geminiApiKey),
    geminiModel: cfg.geminiModel || 'gemini-3.8-flash',
    vertexProjectId: cfg.vertexProjectId,
    substackUrl: cfg.substackUrl,
    journalistPrompt: cfg.journalistPrompt,
    port: cfg.port,
    hasObsidianConfig: fs.existsSync(OBSIDIAN_ENV_PATH),
  };
}

export function importFromObsidian(): { success: boolean; message: string; config?: Partial<AppConfig> } {
  if (!fs.existsSync(OBSIDIAN_ENV_PATH)) {
    return { success: false, message: 'Obsidian .env file not found at ' + OBSIDIAN_ENV_PATH };
  }

  try {
    const raw = fs.readFileSync(OBSIDIAN_ENV_PATH, 'utf8');
    const parsed = dotenv.parse(raw);

    const token = parsed.FEEDLY_ACCESS_TOKEN || '';
    const userId = parsed.FEEDLY_USER_ID || '';

    if (!token && !userId) {
      return { success: false, message: 'No FEEDLY_ACCESS_TOKEN or FEEDLY_USER_ID found in Obsidian .env' };
    }

    saveConfig({
      feedlyAccessToken: token,
      feedlyUserId: userId,
    });

    return {
      success: true,
      message: 'Successfully imported Feedly credentials from Obsidian plugin',
      config: { feedlyAccessToken: token, feedlyUserId: userId },
    };
  } catch (err: any) {
    return { success: false, message: `Failed to read Obsidian .env: ${err.message}` };
  }
}
