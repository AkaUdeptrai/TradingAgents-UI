import { readFile } from 'node:fs/promises';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';

const schema = new URL('../../schema/openapi.json', import.meta.url);
const expected = COMMENT_HEADER + astToString(await openapiTS(schema));
const actual = await readFile(new URL('../src/api/schema.d.ts', import.meta.url), 'utf8');
if (actual !== expected) {
  throw new Error('Generated API types are stale. Run npm run api:generate.');
}
