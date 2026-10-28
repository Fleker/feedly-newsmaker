import * as fetch from 'node-fetch'
import * as request from 'request'
import * as fs from 'fs'

let apiKey: string | undefined = undefined

export function setApiKey(key: string) {
  apiKey = key
}

interface DriveFileList {
  kind: 'drive#fileList'
  incompleteSearch: boolean
  files: {
    kind: 'drive#file'
    mimeType: string
    id: string
    name: string
  }[]
}

export async function listFiles(folderId: string): Promise<DriveFileList> {
  const res = await fetch.default(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${apiKey}`)
  const data = await res.json()
  return data
}

const download = (url, dest) => {
  return new Promise((res, rej) => {
    const file = fs.createWriteStream(dest);
    const sendReq = request.get(url);
    
    // verify response code
    sendReq.on('response', (response) => {
      if (response.statusCode !== 200) {
        console.error(url, dest)
        console.error(response.body)
        console.error(response.statusMessage)
        console.error(response.url)
        return rej('Response status was ' + response.statusCode);
      }
  
      sendReq.pipe(file);
    });
  
    // close() is async, call cb after close completes
    file.on('finish', () => {
      file.close()
      res(url)
    });
  
    // check for request errors
    sendReq.on('error', (err) => {
      fs.unlink(dest, (err) => {
        rej(err?.message)
      }); // delete the (partial) file and then return the error
    });
  
    file.on('error', (err) => { // Handle errors
      fs.unlink(dest, (err) => {
        rej(err?.message)
      }); // delete the (partial) file and then return the error
    });
  })
};

export function downloadUrl(fileId: string) {
  const dlPrefix = 'https://drive.google.com/uc?export=download&id='
  return `${dlPrefix}${fileId}`
}

export async function downloadGoogleDriveFile(fileId: string, filename: string) {
  const dlUrl = downloadUrl(fileId)
  try {
    await download(dlUrl, filename)
  } catch (e) {
    console.error(e)
  }
}

export async function downloadFile(fileUrl: string, filename: string) {
  await download(fileUrl, filename)
}
