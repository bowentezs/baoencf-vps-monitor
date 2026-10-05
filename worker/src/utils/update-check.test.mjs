import assert from 'node:assert/strict';

const {
  canonicalGitHubRepositoryUrl,
  formatAppVersion,
  parseGitHubCommitsAtom,
  parseGitSmartHttpRefs,
  repositoryUrlFromRepositoryUrl,
  shortGitSha,
} = await import('./update-check.ts');

assert.equal(formatAppVersion('2.0.1'), 'v2.0.1');
assert.equal(formatAppVersion('v2.0.1'), 'v2.0.1');
assert.equal(formatAppVersion(''), 'dev');

assert.equal(canonicalGitHubRepositoryUrl('https://github.com/example/cf-vps-monitor'), 'https://github.com/example/cf-vps-monitor');
assert.equal(canonicalGitHubRepositoryUrl('https://github.com/example/cf-vps-monitor.git'), 'https://github.com/example/cf-vps-monitor');
assert.equal(canonicalGitHubRepositoryUrl('github.com/example/cf-vps-monitor'), 'https://github.com/example/cf-vps-monitor');
assert.equal(canonicalGitHubRepositoryUrl('example/cf-vps-monitor'), 'https://github.com/example/cf-vps-monitor');
assert.equal(canonicalGitHubRepositoryUrl('https://github.com/example/cf-vps-monitor/tree/main'), null);
assert.equal(canonicalGitHubRepositoryUrl('https://gitlab.com/example/cf-vps-monitor'), null);
assert.equal(canonicalGitHubRepositoryUrl('not a url'), null);

assert.equal(repositoryUrlFromRepositoryUrl('example/cf-vps-monitor'), 'https://github.com/example/cf-vps-monitor');
assert.equal(shortGitSha('77D873F2552638E38BEBF1D18BC38DB7721042F5'), '77d873f');
assert.equal(shortGitSha(undefined), '');

// Test parseGitSmartHttpRefs
const sampleGitRefs = `001e# service=git-upload-pack
0000015926e7cc423f6d2b8fb1c9c423e6b9fabeaec7bb78 HEAD
003d26e7cc423f6d2b8fb1c9c423e6b9fabeaec7bb78 refs/heads/main
003eaa3393d277d3cfa5db1e144146c3efe2ede02a19 refs/tags/v2.0.0
0000`;
assert.equal(parseGitSmartHttpRefs(sampleGitRefs, 'main'), '26e7cc423f6d2b8fb1c9c423e6b9fabeaec7bb78');
assert.equal(parseGitSmartHttpRefs(sampleGitRefs, 'feature-not-found'), null);

// Test parseGitHubCommitsAtom
const sampleAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:github.com,2008:Grit::Commit/26e7cc423f6d2b8fb1c9c423e6b9fabeaec7bb78</id>
    <link type="text/html" rel="alternate" href="https://github.com/example/repo/commit/26e7cc423f6d2b8fb1c9c423e6b9fabeaec7bb78"/>
    <title>
        fix &amp; test: update &lt;check&gt;
    </title>
    <updated>2026-10-05T04:38:41Z</updated>
    <content type="html">
      &lt;pre&gt;Detailed commit message &amp;amp; description&lt;/pre&gt;
    </content>
  </entry>
</feed>`;
const parsedAtom = parseGitHubCommitsAtom(sampleAtom);
assert.ok(parsedAtom);
assert.equal(parsedAtom.sha, '26e7cc423f6d2b8fb1c9c423e6b9fabeaec7bb78');
assert.equal(parsedAtom.html_url, 'https://github.com/example/repo/commit/26e7cc423f6d2b8fb1c9c423e6b9fabeaec7bb78');
assert.equal(parsedAtom.title, 'fix & test: update <check>');
assert.equal(parsedAtom.body, 'Detailed commit message & description');
assert.equal(parsedAtom.published_at, '2026-10-05T04:38:41Z');

