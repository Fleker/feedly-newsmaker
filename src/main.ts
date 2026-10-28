import { RssArticle, RssFeed, toRss } from "@fleker/standard-feeds";
import { downloadFile, setApiKey } from "./gdrive";
import { getMinutesFeed } from "./glassboro";
import { Storage } from "@google-cloud/storage";
import * as fs from 'fs'
import { convertPdfToText } from "./document-ai";
import { processFile, prompt } from "./gemini";
import { getResolutionsFeed } from "./rowan-board";
import { getBoardMinutes } from "./glassboro-public-schools";

const key = require('../src/gloucester-gazette-efbc71e4fda6.json');
const newsletterSync = require('../src/newsletter-sync.json');

async function getArticlesFrom(key: string) {
  const res = await fetch(`https://us-central1-redside-shiner.cloudfunctions.net/rss_fetch?f[]=${key}&json=true`)
  const json = await res.json() as any
  // console.log(json)
  return json.feed.entries as RssArticle[]
}

function articleTitleToTitle(article: RssArticle) {
  let title = article.title
    .replace(/\//g, '-')
    .replace(/\n/g, '_')
  if (!title.endsWith('.pdf')) {
    title += '.pdf'
  }
  return title
}

function quickArticle(guid, link) {
  return {
    guid,
    authors: [],
    content: 'View minutes',
    link,
    title: link,
    pubDate: new Date()
  }
}

(async () => {
  // Step 1. Gather all of the documents
  setApiKey(process.env.GEMINI_API_KEY || '')
  const articles: RssArticle[] = [
    // https://sites.rowan.edu/president/_docs/6.17.26-bot-audience.pdf
    quickArticle('7', '6.17.26-bot-audience.pdf'),
  ]

  // const articles = await getMinutesFeed()
  // const rowan = await getResolutionsFeed()
  // const ghs = await getBoardMinutes()
  // articles.push(...rowan)
  // articles.push(...ghs)

  // const rssKeys = [
  //   'pitman', 'pitmanboe',
  //   'washingtontownship',
  //   'monroe', 'deptford',
  //   'westdeptford', 'franklin',
  //   'mantua',
  //   'eastgreenwich',
  //   'woolwich',
  // ]
  // for (const key of rssKeys) {
  //   const rssArticles = await getArticlesFrom(key)
  //   articles.push(...rssArticles)
  // }

  // return console.log(...articles.map(x=>'"' + x.guid + '",\n'))
  console.info(`  > found ${articles.length} articles`)
  console.log(articles.map(x => `${x.guid} - ${x.title}`))

  articles
    .filter(article => !newsletterSync.processed.includes(article.guid))
    .forEach(article => console.log(article.guid))

  // Step 2. Create local store
  for (const article of articles) {
    const title = articleTitleToTitle(article)
    if (fs.existsSync(`dl/${title}`)) { continue; }
    if (newsletterSync.processed.includes(article.guid)) { continue; }
    const link = article.link
    .replace(/\s/g, '%20')
    // .replace('https://cms2.revize.com/revize/washingtontownshipnj', 'https://www.twp.washington.nj.us')
    console.info(`${article.guid}    ...downloading ${link} as ${title}`)
    try {
      await downloadFile(link, `dl/${title}`)
    } catch (e) {
      console.error('Cannot download', e)
    }
  }
  console.info(`  > downloaded ${articles.length} articles`)

  // Step 3. Move document store to Google Cloud
  const storage = new Storage({credentials: key})
  const bucket = storage.bucket('glassboro-minutes')
  for (const article of articles) {
    // const object = bucket.file(article.title);
    // if (await object.exists()) { continue; }
    if (newsletterSync.processed.includes(article.guid)) { continue; }
    const title = articleTitleToTitle(article)
    try {
      await bucket.upload(`dl/${title}`)
    } catch (e) {
      console.error('Cannot upload', e)
    }
  }
  console.info(`  > uploaded ${articles.length} articles`)

  // Step 4. Create summaries for each document
  for (const article of articles) {
    if (newsletterSync.processed.includes(article.guid)) { continue; }

    console.log('Begin processing', article.title, `(${article.guid})`)
    const title = articleTitleToTitle(article)
    try {
      const ocrText = await convertPdfToText(`glassboro-minutes/${title}`)
      console.log('  got ocr')
      const llmHeader = await prompt(`Provide a title for the following borough minutes document as though you were a local journalist writing a story in paragraph form. Be accurate.\n\n${ocrText}`)
      const llmReport = await prompt(`Summarize in paragraphs the following borough minutes document as though you were a local journalist writing a column in paragraph form. Be accurate.\n\n${ocrText}`)
      const llmDetails = await prompt(`Describe key points, potential controversial topics, and newsworthy points from the following document as though you were a local journalist writing a column in bullet points\n\n${ocrText}`)
      if (llmHeader === null || llmHeader.candidates === undefined) {
        console.error('llmheader error')
        return
      }
      if (llmReport === null || llmReport.candidates === undefined) {
        console.error('llmheader error')
        return
      }
      if (llmDetails === null || llmDetails.candidates === undefined) {
        console.error('llmheader error')
        return
      }
      // const llmReport = await prompt(`Read the following borough minutes document and write a column about the key points as though you were a local journalist\n\n${ocrText}`)
      // const header = `# Meeting Minutes: ${article.title}\n\n`
      const header = llmHeader.candidates[0].content.parts[0].text
      const report = llmReport.candidates[0].content.parts[0].text
      const details = llmDetails.candidates[0].content.parts[0].text
      fs.writeFileSync(`reports/${title}-report.md`,
        `# ${header}\n\n${report}\n\n${details}\n\n[Source](${article.link})`)
    } catch (e) {
      console.error(`Cannot process ${article.guid}: ${e}`)
    } finally {
      newsletterSync.processed.push(article.guid)
    }
    console.log(`Wrote reports/${`${title}-report.md`}`)
  }
  fs.writeFileSync(`newsletter-sync.json`, JSON.stringify(newsletterSync))
  // const feed: RssFeed = {
  //   entries: articles,
  //   icon: 'https://images.squarespace-cdn.com/content/v1/577196f35016e1776170568d/1476126101553-O3MYV288IPSHSDHGB4CJ/glassboro-logo-green-name.png?format=1500w',
  //   lastBuildDate: new Date(),
  //   link: 'https://drive.google.com/drive/folders/0B-l-QWJCLVkhdW52OHpZWFhLbm8?resourcekey=0-mbjKln7-ZtBHmHijO_ZIPg',
  //   title: 'Glassboro Council Minutes',
  // }
  // console.log(toRss(feed))
})();

// Do this for laws too
(async () => {
  // Step 1. Gather all of the documents
  setApiKey(process.env.GEMINI_API_KEY || '')
  const articles: RssArticle[] = [
  ]
  if (articles.length === 0) return // Nothing to do

  console.info(`  > found ${articles.length} articles`)
  console.log(articles.map(x => `${x.guid} - ${x.title}`))

  articles
    .filter(article => !newsletterSync.processed.includes(article.guid))
    .forEach(article => console.log(article.guid))

  // Step 2. Create local store
  for (const article of articles) {
    const title = articleTitleToTitle(article)
    if (fs.existsSync(`dl/${title}`)) { continue; }
    if (newsletterSync.processed.includes(article.guid)) { continue; }
    const link = article.link
    .replace(/\s/g, '%20')
    // .replace('https://cms2.revize.com/revize/washingtontownshipnj', 'https://www.twp.washington.nj.us')
    console.info(`${article.guid}    ...downloading ${link} as ${title}`)
    try {
      await downloadFile(link, `dl/${title}`)
    } catch (e) {
      console.error('Cannot download', e)
    }
  }
  console.info(`  > downloaded ${articles.length} articles`)

  // Step 3. Move document store to Google Cloud
  const storage = new Storage({credentials: key})
  const bucket = storage.bucket('glassboro-minutes')
  for (const article of articles) {
    // const object = bucket.file(article.title);
    // if (await object.exists()) { continue; }
    if (newsletterSync.processed.includes(article.guid)) { continue; }
    const title = articleTitleToTitle(article)
    try {
      await bucket.upload(`dl/${title}`)
    } catch (e) {
      console.error('Cannot upload', e)
    }
  }
  console.info(`  > uploaded ${articles.length} articles`)

  // Step 4. Create summaries for each document
  for (const article of articles) {
    if (newsletterSync.processed.includes(article.guid)) { continue; }

    console.log('Begin processing', article.title, `(${article.guid})`)
    const title = articleTitleToTitle(article)
    try {
      const ocrText = await convertPdfToText(`glassboro-minutes/${title}`)
      console.log('  got ocr')
      const llmReport = await prompt(`You are a senior policy editor for a NJ-based newspaper. You are ideaologically adjacent to the New Liberals and the Center for New Liberalism. You believe in core liberal principles, a strong social safety net, a pro-tech/pro-innovation approach, and a cosmopolitan attitude.

Take the following bill that has just passed and explain it in a paragraph for the paper.\n\n${ocrText}`)
      if (llmReport === null || llmReport.candidates === undefined) {
        console.error('llmheader error')
        return
      }
      // const llmReport = await prompt(`Read the following borough minutes document and write a column about the key points as though you were a local journalist\n\n${ocrText}`)
      // const header = `# Meeting Minutes: ${article.title}\n\n`
      const report = llmReport.candidates[0].content.parts[0].text
      fs.writeFileSync(`reports/${title}-report.md`,
        `# ${article.title}\n\n${report}\n\n[Source](${article.link})`)
    } catch (e) {
      console.error(`Cannot process ${article.guid}: ${e}`)
    } finally {
      newsletterSync.processed.push(article.guid)
    }
    console.log(`Wrote reports/${`${title}-report.md`}`)
  }
})();
