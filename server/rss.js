/* ছোট RSS/Atom পার্সার — নির্ভরতাহীন। নিখুঁত XML পার্সিং নয়,
   সংবাদ-ফিডের title/link/date তোলার জন্য যথেষ্ট। */

function decodeEntities(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]) : null;
}

function extractImage(block) {
  for (const re of [
    /<media:content[^>]*url="([^"]+)"/i,
    /<media:thumbnail[^>]*url="([^"]+)"/i,
    /<enclosure[^>]*type="image\/[^"]*"[^>]*url="([^"]+)"/i,
    /<enclosure[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i,
    /<img[^>]+src="([^"]+)"/i,
  ]) {
    const m = block.match(re);
    if (m && /^https?:\/\//.test(m[1])) return m[1].replace(/&amp;/g, '&');
  }
  return null;
}

export function parseFeed(xml) {
  const items = [];
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const block of rssItems) {
    const headline = tag(block, 'title');
    const url = tag(block, 'link') || tag(block, 'guid');
    const date = tag(block, 'pubDate') || tag(block, 'dc:date');
    if (headline && url) items.push({ headline, url, publishedAt: date, image: extractImage(block) });
  }
  if (!items.length) {
    const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
    for (const block of entries) {
      const headline = tag(block, 'title');
      const linkMatch = block.match(/<link[^>]*href="([^"]+)"/i);
      const date = tag(block, 'updated') || tag(block, 'published');
      if (headline && linkMatch) items.push({ headline, url: decodeEntities(linkMatch[1]), publishedAt: date, image: extractImage(block) });
    }
  }
  return items.map((item) => {
    const ts = item.publishedAt ? new Date(item.publishedAt) : new Date();
    return { ...item, publishedAt: Number.isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString() };
  });
}

export async function fetchFeed(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ShutroBot/0.1',
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}
