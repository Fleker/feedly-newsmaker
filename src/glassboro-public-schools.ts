import { RssArticle, RssFeed, toRss } from "@fleker/standard-feeds";
import * as cheerio from 'cheerio'

export async function getBoardMinutes(): Promise<RssArticle[]> {
  const boeMinutes = 'https://www.gpsd.us/Page/31'
  const boeFetch = await fetch(boeMinutes)
  const boeHtml = await boeFetch.text()
  // console.log(boeHtml)
  const $ = cheerio.load(boeHtml)
  const navs = $('ul.page-navigation')
  const links = $(navs).find('a')

  const articles: RssArticle[] = []
  // console.info(links.length, links)
  for (const link of links) {
    const annualUrl = $(link).attr('href')!
    // console.log(annualUrl)
    const annualFetch = await fetch(`https://www.gpsd.us${annualUrl}`)
    const annualHtml = await annualFetch.text()
    const annual$ = cheerio.load(annualHtml)
    const minutes = annual$('ul.ui-articles li')
    for (const article of minutes) {
      const ahref =  $(article).find('h1 a')
      const title = $(ahref).text().trim()
      const sanitizedTitle = title
        .replace('Reorganization Meeting Minutes -', '')
        .replace('Reorganization Meeting -', '')
        .replace('Public Budget Hearing -', '')
        .replace('Public Minutes -', '')
        .replace('Special Board Meeting -', '')
        .replace('Special Board meeting', '')
        .replace('Reorganization', '')
        .replace('Reorg', '')
        .replace('Public Budget Hearing', '')
        .replace('Public Board Minutes', '')
        .replace('Board Retreat', '')
        .replace('Approved Minutes', '')
        .trim()
      if (!sanitizedTitle) continue
      const url = $(ahref).attr('href')!.replace('../../', 'https://www.gpsd.us/')
      const date = new Date(sanitizedTitle)
      articles.push({
        authors: ['Glassboro Board of Education'],
        content: 'Open the link to view article',
        guid: url,
        link: url,
        pubDate: date,
        title,
      })
    }
  }

  return articles
}
