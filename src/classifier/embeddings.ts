// L3 classifier stub — deferred to v0.2
// Will wrap onnxruntime-web with the bundled MiniLM-L6-v2 model

export async function loadEmbeddingModel(): Promise<void> {
  throw new Error('L3 ONNX classifier is not yet implemented (v0.2)');
}

export async function computeEmbeddings(_texts: string[]): Promise<Float32Array[]> {
  throw new Error('L3 ONNX classifier is not yet implemented (v0.2)');
}
