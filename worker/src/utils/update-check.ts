export type UpdateCheckResult = {
  current_version: string;
  latest_version: string;
  current_commit: string;
  latest_commit: string;
  has_update: boolean;
  source_url: string;
  upgrade_url: string | null;
  repository_url: string | null;
  title: string;
  body: string;
  published_at: string;
};

export function formatAppVersion(version: string | undefined): string {
  const value = (version || '').trim() || 'dev';
  return value.startsWith('v') || value === 'dev' ? value : `v${value}`;
}

export function canonicalGitHubRepositoryUrl(repositoryUrl: string | undefined): string | null {
  if (!repositoryUrl) return null;
  const raw = repositoryUrl.trim();
  const withScheme = /^https?:\/\//i.test(raw)
    ? raw
    : raw.startsWith('github.com/')
      ? `https://${raw}`
      : /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(raw)
        ? `https://github.com/${raw}`
        : raw;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return `https://github.com/${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

export function repositoryUrlFromRepositoryUrl(repositoryUrl: string | undefined): string | null {
  return canonicalGitHubRepositoryUrl(repositoryUrl);
}

export function normalizeGitSha(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

export function shortGitSha(value: string | undefined): string {
  return normalizeGitSha(value).slice(0, 7);
}

export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

export function parseGitSmartHttpRefs(text: string, branch: string): string | null {
  const target = `refs/heads/${branch}`;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/([0-9a-fA-F]{40})\s+(\S+)/);
    if (match && match[2] === target) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

export type ParsedAtomCommit = {
  sha: string;
  html_url: string;
  title: string;
  body: string;
  published_at: string;
};

export function parseGitHubCommitsAtom(xmlText: string): ParsedAtomCommit | null {
  const entryMatch = xmlText.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) return null;
  const entryContent = entryMatch[1];

  const shaMatch =
    entryContent.match(/<id>[^<]*Grit::Commit\/([0-9a-fA-F]{40})<\/id>/i) ||
    entryContent.match(/\/commit\/([0-9a-fA-F]{40})/i);
  if (!shaMatch) return null;
  const sha = shaMatch[1].toLowerCase();

  const linkMatch = entryContent.match(/<link\s+[^>]*href="([^"]+)"/i);
  const html_url = linkMatch ? linkMatch[1] : '';

  const dateMatch = entryContent.match(/<updated>([^<]+)<\/updated>/i);
  const published_at = dateMatch ? dateMatch[1].trim() : '';

  const titleMatch = entryContent.match(/<title>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : '';

  const preMatch = entryContent.match(/(?:<pre[^>]*>|&lt;pre[\s\S]*?&gt;)([\s\S]*?)(?:<\/pre>|&lt;\/pre&gt;)/i);
  const rawBody = preMatch ? decodeXmlEntities(decodeXmlEntities(preMatch[1].trim())) : rawTitle;

  return {
    sha,
    html_url,
    title: rawTitle,
    body: rawBody,
    published_at,
  };
}

