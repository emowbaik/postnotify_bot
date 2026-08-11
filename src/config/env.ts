/**
 * Runtime environment configuration.
 * Pure validation lives in readEnv.ts so tests never mutate process.env.
 */

import { readEnv } from './readEnv.js';

export { readEnv } from './readEnv.js';
export const env = readEnv(process.env);
