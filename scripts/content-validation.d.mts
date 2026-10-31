export interface ValidatedContentCard {
  id: string;
  front: string;
  back: string;
  furigana: string;
  romaji: string;
  tags: string[];
  lesson?: number;
}

export interface ValidatedContentBundle {
  deckId: string;
  name: string;
  sourcePath: string;
  quiz: 'meaning' | 'reading';
  cards: ValidatedContentCard[];
  sourceReference?: string;
  license?: string;
}

export interface ValidatedContent {
  schemaVersion: 1;
  contentVersion: string;
  bundles: ValidatedContentBundle[];
}

export interface LessonCoverage {
  lesson: number;
  cards: number;
}

export interface ContentCoverage {
  contentVersion: string;
  bundleCount: number;
  cardCount: number;
  vocabulary: { cards: number; lessons: LessonCoverage[] };
  patterns: { cards: number; lessons: LessonCoverage[] };
  kanji: {
    targetCategories: number;
    bundles: { deckId: string; cards: number }[];
  };
  provenanceDeclared: boolean;
}

export function validateContent(root: string): ValidatedContent;
export function summarizeCoverage(validated: ValidatedContent): ContentCoverage;
export function formatCoverageReport(coverage: ContentCoverage): string;
