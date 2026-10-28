import type { Step } from './xrayCsv';

export type { Step };

// One file in data/tests/. Step text is stored verbatim (see docs/spec.md).
export interface TestCase {
  id: string;
  name: string;
  updatedAt: string;
  steps: Step[];
}

export interface TestSummary {
  id: string;
  name: string;
  updatedAt: string;
  stepCount: number;
}
