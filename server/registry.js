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
   feed: null = কার্যকর RSS পাওয়া যায়নি (অনেক পোর্টাল বট-ব্লক করে)। */
const BACKEND_META = {
  'prothom-alo':  { lean: 'neutral', feed: 'https://www.prothomalo.com/feed' },
  'kaler-kantho': { lean: 'govt',    feed: 'https://www.kalerkantho.com/rss.xml' },
  'bd-protidin':  { lean: 'govt',    feed: 'https://www.bd-pratidin.com/rss.xml' },
  'jugantor':     { lean: 'govt',    feed: 'https://www.jugantor.com/feed/rss.xml' },
  'ittefaq':      { lean: 'neutral', feed: null },
  'bdnews24':     { lean: 'neutral', feed: 'https://bangla.bdnews24.com/rss.xml' },
  'manabzamin':   { lean: 'critic',  feed: null },
  'naya-diganta': { lean: 'critic',  feed: null },
  'samakal':      { lean: 'neutral', feed: null },
  'janakantha':   { lean: 'govt',    feed: null },
};

export const SOURCES = Object.fromEntries(
  Object.entries(frontendData.SOURCES).map(([id, meta]) => [
    id, { ...meta, ...BACKEND_META[id] },
  ]),
);

export const TOPICS = frontendData.TOPICS;
export const SAMPLE_CLUSTERS = frontendData.CLUSTERS;
