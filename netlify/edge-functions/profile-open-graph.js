const FIRESTORE_PROJECT_ID = 'digital-business-card-4c09e';

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function readString(fields, key) {
  const value = fields?.[key];
  return typeof value?.stringValue === 'string' ? value.stringValue.trim() : '';
}

function publicImageUrl(value) {
  if (!value) return '';
  try {
    const image = new URL(value);
    return image.protocol === 'https:' || image.protocol === 'http:' ? image.href : '';
  } catch {
    return '';
  }
}

export default async function profileOpenGraph(request, context) {
  const pageResponse = await context.next();
  if (request.method !== 'GET' || !pageResponse.ok) return pageResponse;

  const requestUrl = new URL(request.url);
  const match = requestUrl.pathname.match(/^\/p\/([^/]+)\/?$/);
  if (!match) return pageResponse;

  let slug;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return pageResponse;
  }

  try {
    const documentUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/clients/${encodeURIComponent(slug)}`;
    const profileResponse = await fetch(documentUrl, {
      headers: { accept: 'application/json' }
    });
    if (!profileResponse.ok) return pageResponse;

    const document = await profileResponse.json();
    const fields = document.fields || {};
    const basicInfo = fields.basicInfo?.mapValue?.fields || {};
    const businessName = readString(basicInfo, 'businessName');
    const fullName = readString(basicInfo, 'fullName');
    const title = businessName || fullName || 'Business Profile';
    const description = (readString(basicInfo, 'bio') || `View ${title}'s digital business profile.`).slice(0, 300);
    const image = publicImageUrl(readString(basicInfo, 'logoUrl') || readString(basicInfo, 'avatarUrl'));
    const canonicalUrl = `${requestUrl.origin}/p/${encodeURIComponent(slug)}`;

    const metaTags = [
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${htmlEscape(title)}">`,
      `<meta property="og:description" content="${htmlEscape(description)}">`,
      `<meta property="og:url" content="${htmlEscape(canonicalUrl)}">`,
      `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
      `<meta name="twitter:title" content="${htmlEscape(title)}">`,
      `<meta name="twitter:description" content="${htmlEscape(description)}">`,
      image ? `<meta property="og:image" content="${htmlEscape(image)}">` : '',
      image ? `<meta name="twitter:image" content="${htmlEscape(image)}">` : ''
    ].filter(Boolean).join('\n    ');

    const html = await pageResponse.text();
    if (!html.includes('</head>')) return pageResponse;

    const headers = new Headers(pageResponse.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');

    return new Response(html.replace('</head>', `    ${metaTags}\n  </head>`), {
      status: pageResponse.status,
      statusText: pageResponse.statusText,
      headers
    });
  } catch (error) {
    console.error('Profile link preview metadata could not be generated:', error);
    return pageResponse;
  }
}

export const config = { path: '/p/*' };
