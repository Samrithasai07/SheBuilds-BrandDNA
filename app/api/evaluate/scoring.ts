export type EvaluationScores = {
  brandAlignment: number;
  originality: number;
  authenticity: number;
  policy: number;
};

export type PolicyEvaluation = {
  score: number;
  forbidden: string[];
};

const clamp = (value: number, minimum = 0, maximum = 100) =>
  Math.min(maximum, Math.max(minimum, value));

// Empirical operating points for BAAI/bge-small-en-v1.5. Scores at or below
// the unrelated-text floor contain no useful brand signal; scores at or above
// the strong-match point represent fully aligned semantic evidence.
const BGE_CALIBRATION = {
  unrelatedFloor: 0.45,
  strongMatch: 0.9,
  rankDecay: 0.15,
} as const;

/** Qdrant cosine scores are already normalized for this pipeline; reject invalid values. */
export const normalizeCosineSimilarity = (similarity: number) =>
  Number.isFinite(similarity) ? clamp(similarity, 0, 1) : 0;

export const averageCosineSimilarity = (similarities: readonly number[]) => {
  if (similarities.length === 0) return 0;
  return similarities.reduce((sum, value) => sum + normalizeCosineSimilarity(value), 0) /
    similarities.length;
};

export const weightedCosineSimilarity = (similarities: readonly number[]) => {
  if (similarities.length === 0) return 0;
  let weightedTotal = 0;
  let weightTotal = 0;
  similarities.forEach((similarity, rank) => {
    const weight = BGE_CALIBRATION.rankDecay ** rank;
    weightedTotal += normalizeCosineSimilarity(similarity) * weight;
    weightTotal += weight;
  });
  return weightedTotal / weightTotal;
};

/** Converts BGE cosine space into semantic relevance, rather than displaying raw cosine. */
export const calibrateSemanticRelevance = (similarity: number) => {
  const { unrelatedFloor, strongMatch } = BGE_CALIBRATION;
  return clamp((normalizeCosineSimilarity(similarity) - unrelatedFloor) /
    (strongMatch - unrelatedFloor), 0, 1);
};

export class BrandAlignmentEngine {
  evaluate(similarities: readonly number[]) {
    return Math.round(calibrateSemanticRelevance(weightedCosineSimilarity(similarities)) * 100);
  }
}

export class OriginalityEngine {
  evaluate(similarities: readonly number[]) {
    if (similarities.length === 0) return 0;
    return Math.round(clamp(100 - calibrateSemanticRelevance(weightedCosineSimilarity(similarities)) * 100));
  }
}

export class AuthenticityEngine {
  evaluate(similarities: readonly number[]) {
    if (similarities.length === 0) return 0;
    return Math.round(clamp(100 - calibrateSemanticRelevance(weightedCosineSimilarity(similarities)) * 100));
  }
}

export class PolicyEngine {
  evaluate(content: string, forbiddenWords: readonly string[]): PolicyEvaluation {
    const normalizedContent = content.toLocaleLowerCase();
    const rules = [...new Set(forbiddenWords.map((word) => word.trim()).filter(Boolean))];
    const forbidden = rules.filter((word) => normalizedContent.includes(word.toLocaleLowerCase()));
    const score = rules.length === 0 ? 0 : Math.round(clamp(100 - (forbidden.length / rules.length) * 100));
    return { score, forbidden };
  }
}

export class EvidenceFusionEngine {
  static readonly weights = {
    brandAlignment: 0.35,
    originality: 0.3,
    authenticity: 0.2,
    policy: 0.15,
  } as const;

  evaluate(scores: EvaluationScores) {
    const { weights } = EvidenceFusionEngine;
    return Math.round(clamp(
      scores.brandAlignment * weights.brandAlignment +
      scores.originality * weights.originality +
      scores.authenticity * weights.authenticity +
      scores.policy * weights.policy,
    ));
  }
}
