import { createHash } from "node:crypto";

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): number[];
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((token) => token.length > 1);
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local-hash";
  readonly dimensions = 64;

  embed(text: string): number[] {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    for (const token of tokenize(text)) {
      const hash = createHash("sha256").update(token).digest();
      const index = hash[0]! % this.dimensions;
      const sign = hash[1]! % 2 === 0 ? 1 : -1;
      const weight = 1 + (hash[2]! % 7) / 10;
      vector[index] += sign * weight;
    }
    return normalize(vector);
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return score;
}

export function createEmbeddingProvider(provider: "local" | "mock" | "external" = "local"): EmbeddingProvider {
  if (provider === "external") {
    throw new Error("External embedding providers are not configured. Use local or mock provider.");
  }
  return new LocalHashEmbeddingProvider();
}

