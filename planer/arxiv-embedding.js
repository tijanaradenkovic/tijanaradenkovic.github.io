import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let extractor;
const vectors = new Map();

async function embed(texts) {
  const missing = [...new Set(texts)].filter(text => !vectors.has(text));
  for (let offset = 0; offset < missing.length; offset += 4) {
    const batch = missing.slice(offset, offset + 4);
    const output = await extractor(batch, {pooling: 'mean', normalize: true});
    output.tolist().forEach((vector, index) => vectors.set(batch[index], vector));
  }
  return texts.map(text => vectors.get(text));
}

self.onmessage = async ({data}) => {
  try {
    if (vectors.size > 500) vectors.clear();
    extractor ??= await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {dtype: 'q8', device: 'wasm'});
    const profile = await embed(data.profile);
    const papers = await embed(data.papers.map(paper => paper.text));
    const scores = papers.map((vector, index) => [data.papers[index].id,
      Math.max(0, ...profile.map(reference => reference.reduce((sum, value, i) => sum + value * vector[i], 0)))]);
    self.postMessage({scores});
  } catch {
    self.postMessage({error: true});
  }
};
