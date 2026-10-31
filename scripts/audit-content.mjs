#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatCoverageReport, summarizeCoverage, validateContent } from './content-validation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const validated = validateContent(root);
  process.stdout.write(formatCoverageReport(summarizeCoverage(validated)));
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}
