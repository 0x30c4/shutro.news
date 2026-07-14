/* পোর্টাল রেজিস্ট্রি — মালিকানা মেটাডেটা frontend data.js-এর SOURCES থেকে লোড হয়
   (একটাই উৎস, দ্বিগুণ রক্ষণাবেক্ষণ নয়)। এখানে শুধু ব্যাকএন্ড-বিশেষ তথ্য:
   RSS ফিড আর পোর্টালের সামগ্রিক ঝোঁক (blindspot হিসাবের জন্য)। */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadFrontendData() {
  const code = readFileSync(new URL('../data.js', import.meta.url), 'utf8');
  return vm.runInNewContext(
    `${code};({ SOURCES, CLUSTERS, TOPICS, STANCES, OWNER_TYPES })`, {},
  );
}

export const frontendData = loadFrontendData();

/* lean: এই পোর্টাল কোন পক্ষে হেলে — blindspot নির্ণয়ে ব্যবহৃত।
   feed: সরাসরি RSS (ছবিসহ, সেরা)। অনেক পোর্টাল ফিড বট-ব্লক করে —
   সেগুলোর শিরোনাম আসে Google News RSS থেকে (gnews: true, ছবি নেই;
   ক্লাস্টারের ছবি আসে অন্য সদস্য-পোর্টালের আসল প্রতিবেদন থেকে)। */
const gn = (domain) =>
  `https://news.google.com/rss/search?q=site:${domain}+when:1d&hl=bn&gl=BD&ceid=BD:bn`;

const BACKEND_META = {
  'prothom-alo':  { lean: 'neutral', feed: 'https://www.prothomalo.com/feed' },
  'kaler-kantho': { lean: 'govt',    feed: gn('kalerkantho.com'), gnews: true },
  'bd-protidin':  { lean: 'govt',    feed: gn('bd-pratidin.com'), gnews: true },
  'jugantor':     { lean: 'govt',    feed: gn('jugantor.com'), gnews: true },
  'ittefaq':      { lean: 'neutral', feed: gn('ittefaq.com.bd'), gnews: true },
  'bdnews24':     { lean: 'neutral', feed: gn('bangla.bdnews24.com'), gnews: true },
  'manabzamin':   { lean: 'critic',  feed: gn('mzamin.com'), gnews: true },
  'naya-diganta': { lean: 'critic',  feed: gn('dailynayadiganta.com'), gnews: true },
  'samakal':      { lean: 'neutral', feed: gn('samakal.com'), gnews: true },
  'janakantha':   { lean: 'govt',    feed: gn('dailyjanakantha.com'), gnews: true },
  'bbc-bangla':   { lean: 'neutral', feed: 'https://feeds.bbci.co.uk/bengali/rss.xml' },
  'jagonews24':   { lean: 'neutral', feed: 'https://www.jagonews24.com/rss/rss.xml' },
  'dhakapost':    { lean: 'neutral', feed: 'https://www.dhakapost.com/rss/rss.xml' },
  'risingbd':     { lean: 'govt',    feed: 'https://www.risingbd.com/rss/rss.xml' },
};

export const SOURCES = Object.fromEntries(
  Object.entries(frontendData.SOURCES).map(([id, meta]) => [
    id, { ...meta, ...BACKEND_META[id] },
  ]),
);

export const TOPICS = frontendData.TOPICS;
export const SAMPLE_CLUSTERS = frontendData.CLUSTERS;
