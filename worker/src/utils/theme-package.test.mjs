import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeCustomCss, buildThemeCss } from './theme-package.ts';

test('sanitizeCustomCss removes @import statements', () => {
  const css = '@import url("https://evil.com/style.css"); body { color: red; }';
  assert.equal(sanitizeCustomCss(css).trim(), 'body { color: red; }');
});

test('sanitizeCustomCss removes javascript url protocols', () => {
  const css = 'div { background-image: url("javascript:alert(1)"); }';
  assert.equal(sanitizeCustomCss(css).replace(/\s+/g, ' ').trim(), 'div { background-image: ; }');
});

test('sanitizeCustomCss removes behavior and expression', () => {
  const css = 'div { behavior: url(xss.htc); width: expression(alert(1)); height: 100px; }';
  const sanitized = sanitizeCustomCss(css);
  assert.equal(sanitized.includes('expression'), false);
  assert.equal(sanitized.includes('behavior'), false);
  assert.equal(sanitized.includes('height: 100px;'), true);
});

test('buildThemeCss applies sanitization', () => {
  const output = buildThemeCss({
    styleCss: 'main { display: block; }',
    config: {},
    customCss: '@import url("https://evil.com/leak.css"); p { color: blue; }',
  });
  assert.equal(output.includes('@import'), false);
  assert.equal(output.includes('p { color: blue; }'), true);
});

