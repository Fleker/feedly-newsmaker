import { RssArticle, RssFeed, toRss } from "@fleker/standard-feeds";
import { downloadUrl, listFiles } from "./gdrive";

export async function getMinutesFeed(): Promise<RssArticle[]> {
  // https://drive.google.com/drive/folders/0B-l-QWJCLVkhdW52OHpZWFhLbm8?resourcekey=0-mbjKln7-ZtBHmHijO_ZIPg
  const driveFolders = [
    // Council Minutes 2023
    '16BsP0MfJhPe1WEekmYiTNYpZgBycV-Yc',
    // Planning Board 2024
    '1nIHJPJNQakfWCHxOpeqb4BuWQE-4-Cnt',
    // Council Minutes 2024
    '1r1I_wVdaH9uEjGOJZJM3EkI0dBjQFNOM',
  ]
  const articles: RssArticle[] = []
  for (const folder of driveFolders) {
    const filesInFolder = await listFiles(folder)
    // console.log(filesInFolder)
    for (const file of filesInFolder.files) {
      // console.log(file.name
        // .replace('PB MINUTES', '')
        // .replace('_001', '')
        // .replace(/(\d)\./g, '$1-')
        // .replace('-pdf', ''))
      const article: RssArticle = {
        authors: ['Borough of Glassboro'],
        link: downloadUrl(file.id),
        title: file.name,
        content: 'Click link to view minutes',
        pubDate: new Date(file.name
          .replace('PB MINUTES', '')
          .replace('_001', '')
          .replace(/(\d)\./g, '$1-')
          .replace('-pdf', '')),
        guid: file.id,
      }
      articles.push(article)
    }
  }

  // const feed: RssFeed = {
  //   entries: articles,
  //   icon: 'https://images.squarespace-cdn.com/content/v1/577196f35016e1776170568d/1476126101553-O3MYV288IPSHSDHGB4CJ/glassboro-logo-green-name.png?format=1500w',
  //   lastBuildDate: new Date(),
  //   link: 'https://drive.google.com/drive/folders/0B-l-QWJCLVkhdW52OHpZWFhLbm8?resourcekey=0-mbjKln7-ZtBHmHijO_ZIPg',
  //   title: 'Glassboro Council Minutes',
  // }
  return articles
}
