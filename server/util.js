export const bn = (value) => String(value).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

const dhakaTime = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'Asia/Dhaka',
});

function dhakaParts(iso) {
  const parts = dhakaTime.formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const m = parts.find((p) => p.type === 'minute').value;
  return { h, m };
}

/* '৯:১৪' — ১২-ঘণ্টা ঘড়ি, বাংলা সংখ্যায় */
export function clockBn(iso) {
  const { h, m } = dhakaParts(iso);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return bn(`${h12}:${m}`);
}

/* 'সকাল ৯:১৪' — প্রহরসহ */
export function clockWithPeriodBn(iso) {
  const { h } = dhakaParts(iso);
  const period =
    h >= 4 && h < 6 ? 'ভোর' :
    h >= 6 && h < 12 ? 'সকাল' :
    h >= 12 && h < 16 ? 'দুপুর' :
    h >= 16 && h < 18 ? 'বিকেল' :
    h >= 18 && h < 20 ? 'সন্ধ্যা' : 'রাত';
  return `${period} ${clockBn(iso)}`;
}

/* '৩০ মিনিট আগে' */
export function relativeBn(iso, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'এইমাত্র';
  if (mins < 60) return `${bn(mins)} মিনিট আগে`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${bn(hours)} ঘণ্টা আগে`;
  return `${bn(Math.round(hours / 24))} দিন আগে`;
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
