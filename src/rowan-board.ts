import { RssArticle, RssFeed, toRss } from "@fleker/standard-feeds";
import { downloadUrl, listFiles } from "./gdrive";

export async function getResolutionsFeed(): Promise<RssArticle[]> {
  const agendas = 'https://sites.rowan.edu/president/board-of-trustees/resolutions.html'
  const agendaRes = await fetch(agendas)
  const agendaHtml = await agendaRes.text()
  const resolutions = agendaHtml.split('<div><a href="')
  const articles: RssArticle[] = []
  for (const agenda of resolutions) {
    const quote = agenda.indexOf('"')
    if (quote === -1) { continue; }
    const docPath = agenda.substring(0, quote)
    if (!docPath.endsWith('.pdf')) { continue; }
    const docUrl = `https://sites.rowan.edu/president${docPath.replace('..', '')}`
    const endOfLink = agenda.indexOf('</a>')
    // const linkText = agenda.substring(quote + 2, endOfLink)
    // console.log(docPath)
    const pathSplit = docPath.split('/')
    const linkText = pathSplit[pathSplit.length - 1]
    const date = new Date(linkText
      .replace('Resolutions', '')
      .replace('&#160;', '')
      .trim())

    const article: RssArticle = {
      authors: ['Rowan Board of Trustees'],
      link: docUrl,
      title: linkText,
      content: 'Click link to view resolutions',
      pubDate: date,
      guid: linkText.replace(/[\s,]/g, '-'),
    }
    articles.push(article)
  }
  return articles
}
