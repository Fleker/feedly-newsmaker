import * as fs from 'fs'
import {DocumentProcessorServiceClient} from '@google-cloud/documentai';
import { google } from '@google-cloud/documentai/build/protos/protos';

const endpointOcr = 'https://us-documentai.googleapis.com/v1/projects/459060182161/locations/us/processors/b42f3f78994c438f:process'
const ocrProcessorId = 'projects/459060182161/locations/us/processors/b42f3f78994c438f'
const key = require('../src/gloucester-gazette-efbc71e4fda6.json');
const client = new DocumentProcessorServiceClient({credentials: key});

export async function convertPdfToText(gcsFile: string) {
  const request: google.cloud.documentai.v1.IProcessRequest = {
    name: ocrProcessorId,
    gcsDocument: {
      gcsUri: `gs://${gcsFile}`,
      mimeType: 'application/pdf',
    },
    processOptions: {
      fromStart: 15, // API maximum
    }
  }
  const [result] = await client.processDocument(request)
  const {document} = result
  const {text} = document!
  const limits = text?.indexOf('THE TAPE IS AVAILABLE')
  if (limits && limits > -1) {
    return text!.substring(0, limits)
  }
  return text!
}
