import {VertexAI, HarmCategory, HarmBlockThreshold, GenerateContentRequest} from '@google-cloud/vertexai';

const key = require('../src/gloucester-gazette-efbc71e4fda6.json');
const project = 'gloucester-gazette';
const location = 'us-central1';

const vertex_ai = new VertexAI({project: project, location: location, googleAuthOptions: {credentials: key}});

// Instantiate models
const generativeModel = vertex_ai.getGenerativeModel({
  model: 'gemini-3.8-flash',
  // The following parameters are optional
  // They can also be passed to individual content generation requests
  safetySettings: [{category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE}],
  generationConfig: {},
});

const generativeVisionModel = vertex_ai.getGenerativeModel({
  model: 'gemini-3.8-flash',
});

export async function processFile(gcsFile: string) {
  const filePart = {
    fileData: {
      fileUri: `gs://${gcsFile}`,
      mimeType: 'application/pdf'
    }
  }
  const textPart = {
    text: 'Summarize this document as a local journalist for an online newsletter'
  }
  const request: GenerateContentRequest = {
    contents: [{
      role: 'user',
      parts: [textPart, filePart]
    }]
  }
  const gemRes = await generativeVisionModel.generateContent(request)
  const res = await gemRes.response
  if (res.candidates === undefined) {
    console.error('no res candidates')
    return null
  }
  console.log(res.candidates[0].content)
  return res
}

export async function prompt(promt: string) {
  const request = {
    contents: [{role: 'user', parts: [{text: promt}]}],
  };
  const gemRes = await generativeModel.generateContent(request);
  const res = await gemRes.response
  // console.log(res.candidates[0].content)
  return res
}
