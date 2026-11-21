import * as cheerio from 'cheerio';
import WebSocket from 'ws';
import crypto from 'crypto';

function sanitizeTextForTts(str: string): string {
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXmlText(str: string): string {
  return sanitizeTextForTts(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Fetch Google Translate TTS audio chunks
export async function fetchGoogleTranslateAudio(text: string): Promise<Buffer> {
  const cleanText = sanitizeTextForTts(text);
  const chunkStrings: string[] = [];
  if (cleanText.length <= 180) {
    chunkStrings.push(cleanText);
  } else {
    const words = cleanText.split(/\s+/);
    let current = '';
    for (const w of words) {
      if ((current + ' ' + w).trim().length <= 180) {
        current = (current + ' ' + w).trim();
      } else {
        if (current) chunkStrings.push(current);
        current = w;
      }
    }
    if (current) chunkStrings.push(current);
  }

  const audioBuffers: Buffer[] = [];
  for (let i = 0; i < chunkStrings.length; i++) {
    const chunk = chunkStrings[i];
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
      chunk
    )}&tl=vi&total=${chunkStrings.length}&idx=${i}&textlen=${chunk.length}&client=tw-ob&prev=input`;

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: 'https://translate.google.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`Google Translate TTS trả về mã lỗi: ${response.status}`);
    }

    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength === 0) {
      throw new Error('Google Translate TTS trả về dữ liệu âm thanh rỗng');
    }
    audioBuffers.push(Buffer.from(arrayBuf));
  }

  return Buffer.concat(audioBuffers);
}

// DRM v2 Sec-MS-GEC utilities for Microsoft Edge Neural TTS
const WIN_EPOCH = 11644473600n;
const EDGE_TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

const _SHA256_INITIAL = [
  0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
  0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
];

const _SHA256_STATE = [
  0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A,
  0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2,
];

const _SHA256_SCHEDULE = [
  0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA,
  0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6,
  0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33,
  0xD258B060, 0x72766564,
];

const _SHA256_ROUND_CONSTANTS = [
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
];

const _SHA256_ADJUSTMENT = 0xC9DC06A7;
const _SHA256_BLOCK_CONSTANTS = [
  ..._SHA256_ROUND_CONSTANTS.slice(0, 14),
  _SHA256_ADJUSTMENT,
  ..._SHA256_ROUND_CONSTANTS.slice(15),
];

const _SHA256_SIGMA0_ADJUSTMENT = 0x059C0B80;
const _SHA256_SIGMA1_ADJUSTMENT = 0x000B92C0;

const _CS64_COEFFICIENTS = [
  [0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D], [0x3BEB65BC, 0x29514038],
  [0xC89C5933, 0xB328CBDF], [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C],
  [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB], [0x06064CF3, 0xFA51A3DA],
  [0xDA79FA60, 0x207CC464], [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61],
  [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167],
];

const _CS64_FACTOR = 0x82893933;
const _CS64_ADJUSTMENT0 = 0xF2F90B1A;
const _CS64_ADJUSTMENT1 = 0x0B1A0000;

function _u32(val: number | bigint): number {
  return Number(BigInt(val) & 0xFFFFFFFFn);
}

function _rol16(value: number): number {
  const v = _u32(value);
  return _u32(((v << 16) | (v >>> 16)));
}

function _sigma0(value: number): number {
  const v = _u32(value);
  return _u32((v >>> 7) ^ (v << 25) ^ (v >>> 18) ^ (v << 14) ^ (v >>> 3));
}

function _sigma1(value: number): number {
  const v = _u32(value);
  return _u32((v >>> 17) ^ (v << 15) ^ (v >>> 19) ^ (v << 13) ^ (v >>> 10));
}

function _expand_sha256_schedule(words: number[], first_word = 16): void {
  for (let index = first_word; index < 64; index++) {
    const x = words[index - 2];
    const y = words[index - 15];
    const s1 = _sigma1(x);
    const s0 = _sigma0(y);
    words.push(_u32(BigInt(s1) + BigInt(words[index - 7]) + BigInt(s0) + BigInt(words[index - 16])));
  }
}

function _sha256_rounds(state: number[], words: number[], first_round = 0): number[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = first_round === 14 ? _SHA256_BLOCK_CONSTANTS : _SHA256_ROUND_CONSTANTS;
  const aligned = Math.min(64, Math.floor((first_round + 7) / 8) * 8);

  for (let index = first_round; index < aligned; index++) {
    const rot_e = BigInt(e) * 0x100000001n;
    const rot_a = BigInt(a) * 0x100000001n;
    const t1 = _u32(BigInt(h) + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + BigInt(g ^ (e & (f ^ g))) + BigInt(constants[index]) + BigInt(words[index]));
    const t2 = _u32(((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + BigInt((a & b) | (c & (a | b))));
    [a, b, c, d, e, f, g, h] = [_u32(BigInt(t1) + BigInt(t2)), a, b, c, _u32(BigInt(d) + BigInt(t1)), e, f, g];
  }

  for (let index = aligned; index < 64; index += 8) {
    let rot_e = BigInt(e) * 0x100000001n;
    let rot_a = BigInt(a) * 0x100000001n;
    let t1 = _u32(BigInt(h) + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + BigInt(g ^ (e & (f ^ g))) + BigInt(constants[index]) + BigInt(words[index]));
    d = _u32(BigInt(d) + BigInt(t1));
    h = _u32(BigInt(t1) + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + BigInt((a & b) | (c & (a | b))));

    rot_e = BigInt(d) * 0x100000001n;
    rot_a = BigInt(h) * 0x100000001n;
    t1 = _u32(BigInt(g) + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + BigInt(f ^ (d & (e ^ f))) + BigInt(constants[index + 1]) + BigInt(words[index + 1]));
    c = _u32(BigInt(c) + BigInt(t1));
    g = _u32(BigInt(t1) + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + BigInt((h & a) | (b & (h | a))));

    rot_e = BigInt(c) * 0x100000001n;
    rot_a = BigInt(g) * 0x100000001n;
    t1 = _u32(BigInt(f) + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + BigInt(e ^ (c & (d ^ e))) + BigInt(constants[index + 2]) + BigInt(words[index + 2]));
    b = _u32(BigInt(b) + BigInt(t1));
    f = _u32(BigInt(t1) + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + BigInt((g & h) | (a & (g | h))));

    rot_e = BigInt(b) * 0x100000001n;
    rot_a = BigInt(f) * 0x100000001n;
    t1 = _u32(BigInt(e) + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + BigInt(d ^ (b & (c ^ d))) + BigInt(constants[index + 3]) + BigInt(words[index + 3]));
    a = _u32(BigInt(a) + BigInt(t1));
    e = _u32(BigInt(t1) + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + BigInt((f & g) | (h & (f | g))));

    rot_e = BigInt(a) * 0x100000001n;
    rot_a = BigInt(e) * 0x100000001n;
    t1 = _u32(BigInt(d) + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + BigInt(c ^ (a & (b ^ c))) + BigInt(constants[index + 4]) + BigInt(words[index + 4]));
    h = _u32(BigInt(h) + BigInt(t1));
    d = _u32(BigInt(t1) + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + BigInt((e & f) | (g & (e | f))));

    rot_e = BigInt(h) * 0x100000001n;
    rot_a = BigInt(d) * 0x100000001n;
    t1 = _u32(BigInt(c) + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + BigInt(b ^ (h & (a ^ b))) + BigInt(constants[index + 5]) + BigInt(words[index + 5]));
    g = _u32(BigInt(g) + BigInt(t1));
    c = _u32(BigInt(t1) + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + BigInt((d & e) | (f & (d | e))));

    rot_e = BigInt(g) * 0x100000001n;
    rot_a = BigInt(c) * 0x100000001n;
    t1 = _u32(BigInt(b) + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + BigInt(a ^ (g & (h ^ a))) + BigInt(constants[index + 6]) + BigInt(words[index + 6]));
    f = _u32(BigInt(f) + BigInt(t1));
    b = _u32(BigInt(t1) + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + BigInt((c & d) | (e & (c | d))));

    rot_e = BigInt(f) * 0x100000001n;
    rot_a = BigInt(b) * 0x100000001n;
    t1 = _u32(BigInt(a) + ((rot_e >> 6n) ^ (rot_e >> 11n) ^ (rot_e >> 25n)) + BigInt(h ^ (f & (g ^ h))) + BigInt(constants[index + 7]) + BigInt(words[index + 7]));
    e = _u32(BigInt(e) + BigInt(t1));
    a = _u32(BigInt(t1) + ((rot_a >> 2n) ^ (rot_a >> 13n) ^ (rot_a >> 22n)) + BigInt((b & c) | (d & (b | c))));
  }

  return [a, b, c, d, e, f, g, h];
}

function _sha256_init(data: Buffer): number[] {
  const words = new Array(14).fill(0);
  words.push((data[0] << 16) | (data[1] << 8) | data[2]);
  words.push((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]);

  for (let index = 16; index < 30; index++) {
    let value = _SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) {
      value = _u32(BigInt(value) + BigInt((index === 16 ? (_sigma1(words[index - 2]) ^ _SHA256_SIGMA1_ADJUSTMENT) : _sigma1(words[index - 2]))));
    }
    if (index - 7 >= 14) {
      value = _u32(BigInt(value) + BigInt(words[index - 7]));
    }
    if (index - 15 >= 14) {
      value = _u32(BigInt(value) + BigInt((index === 29 ? (_sigma0(words[index - 15]) ^ _SHA256_SIGMA0_ADJUSTMENT) : _sigma0(words[index - 15]))));
    }
    words.push(value);
  }

  words.push(_u32(
    BigInt(_sigma1(words[28])) +
    BigInt(words[23]) +
    BigInt(_sigma0(words[15])) +
    BigInt(words[14]) +
    BigInt(_SHA256_ADJUSTMENT) -
    BigInt(_SHA256_ROUND_CONSTANTS[14])
  ));

  _expand_sha256_schedule(words, 31);
  const working = _sha256_rounds(_SHA256_STATE, words, 14);
  return _SHA256_INITIAL.map((x, i) => _u32(BigInt(x) + BigInt(working[i])));
}

function _sha256_digest(data: Buffer): Buffer {
  const length = 57 + data.length;
  const padLen = (55 - length) % 64;
  const padCount = padLen < 0 ? padLen + 64 : padLen;
  const padded = Buffer.concat([
    data.subarray(7),
    Buffer.from([0x80]),
    Buffer.alloc(padCount, 0),
    Buffer.alloc(8),
  ]);
  padded.writeBigUInt64BE(BigInt(length) * 8n, padded.length - 8);

  let state = _sha256_init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words: number[] = [];
    for (let i = 0; i < 16; i++) {
      words.push(padded.readUInt32BE(offset + i * 4));
    }
    _expand_sha256_schedule(words);
    const working = _sha256_rounds(state, words);
    state = state.map((x, i) => _u32(BigInt(x) + BigInt(working[i])));
  }

  const out = Buffer.alloc(32);
  for (let i = 0; i < 8; i++) {
    out.writeUInt32BE(state[i], i * 4);
  }
  return out;
}

function _words_le4_even(data: Buffer): number[] {
  const padLen = (-data.length) % 4;
  const padCount = padLen < 0 ? padLen + 4 : padLen;
  const padded = Buffer.concat([data, Buffer.alloc(padCount, 0)]);
  const words: number[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    words.push(padded.readUInt32LE(i));
  }
  if (words.length % 2 !== 0) {
    words.push(0);
  }
  return words;
}

function _cs64_digest(data: Buffer, digest: Buffer): [number, number] {
  const key_a = digest.readUInt32LE(0) | 1;
  const key_b = digest.readUInt32LE(4) | 1;
  const factors = [
    _u32(BigInt(key_a) * BigInt(_CS64_FACTOR)),
    _u32(BigInt(key_b) * BigInt(_CS64_FACTOR)),
  ];
  const terms = _CS64_COEFFICIENTS.map(([c, _], i) => _u32(BigInt(c) * BigInt(factors[i % 2])));
  const offsets = _CS64_COEFFICIENTS.map(([_, o]) => o);

  const words = _words_le4_even(Buffer.concat([Buffer.from([0]), data]));
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const term = _u32(BigInt(word) * BigInt(index % 2 === 0 ? key_a : key_b));
    let offset = _u32(BigInt(_rol16(word)) * BigInt(index % 2 === 0 ? 0xEF0569FB : 0xC31713DB));
    if (index === 0) {
      terms.push(_u32(BigInt(term) + BigInt(_CS64_ADJUSTMENT0) * BigInt(factors[0])));
      offset = _u32(BigInt(offset) + BigInt(_CS64_ADJUSTMENT1));
    } else {
      terms.push(term);
    }
    offsets.push(offset);
  }

  let swap_acc = 0, swap_last = 0, state = 0, acc = 0;
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index], y = terms[index + 1];
    let t = _rol16(_u32(BigInt(offsets[index]) + BigInt(x)));
    let q = _u32(BigInt(t) * 0x76F50F34n);
    swap_acc = _u32(BigInt(swap_acc) + BigInt(_rol16(q)) * 0xC3EFEA97n + BigInt(q));
    t = _rol16(_u32(BigInt(offsets[index + 1]) + BigInt(y)));
    q = _u32(BigInt(t) * 0x1881CE3Cn);
    swap_last = _u32(BigInt(_rol16(q)) * 0x35BD1EC9n + BigInt(q));
    swap_acc = _u32(BigInt(swap_acc) + BigInt(swap_last));
    state = _u32(BigInt(state) * BigInt(key_a) + BigInt(x));
    state = _u32(BigInt(_rol16(state)) * 0xCF98B111n);
    state = _u32(BigInt(_rol16(state)) * 0x87085B9Fn);
    state = _u32(BigInt(_rol16(state)) * 0x12CEB96Dn);
    state = _u32(BigInt(_rol16(state)) * 0x257E1D83n);
    acc = _u32(BigInt(acc) + BigInt(state));
    t = _u32(BigInt(state) * BigInt(key_b) + BigInt(y));
    t = _u32(BigInt(_rol16(t)) * 0xA27416F5n);
    t = _u32(BigInt(_rol16(t)) * 0xD38396FFn);
    state = _u32(BigInt(_rol16(_u32(BigInt(_rol16(t)) * 0x7C932B89n))) * 0xBFA49F69n);
    acc = _u32(BigInt(acc) + BigInt(state));
  }

  return [_u32(swap_last ^ state), _u32(swap_acc ^ acc)];
}

function generateSecMsGecV2(unixTimestamp?: number): string {
  let ticks = BigInt(Math.floor(unixTimestamp || (Date.now() / 1000)));
  ticks += WIN_EPOCH;
  ticks -= ticks % 300n;
  ticks *= 10000000n;
  const strToHash = Buffer.from(ticks.toString() + EDGE_TRUSTED_CLIENT_TOKEN, 'ascii');
  const digest = _sha256_digest(strToHash);
  const [cs0, cs1] = _cs64_digest(strToHash, digest);
  const csBuf = Buffer.alloc(8);
  csBuf.writeUInt32LE(cs0, 0);
  csBuf.writeUInt32LE(cs1, 4);
  const cs64 = csBuf.toString('hex').toUpperCase();
  const sha256 = digest.toString('hex').toUpperCase();
  return `${cs64}-${sha256}`;
}

function generateEdgeMuid(): string {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

interface EdgeVoiceProfile {
  baseVoice: string;
  pitchOffsetPercent: number;
  rateMultiplier: number;
  region: string;
  gender: 'female' | 'male';
}

const EDGE_VOICE_PROFILES: Record<string, EdgeVoiceProfile> = {
  'vi-VN-MaiLinh-Southern': {
    baseVoice: 'vi-VN-HoaiMyNeural',
    pitchOffsetPercent: 0,
    rateMultiplier: 1.0,
    region: 'Nam',
    gender: 'female',
  },
  'vi-VN-MinhQuang-Southern': {
    baseVoice: 'vi-VN-NamMinhNeural',
    pitchOffsetPercent: 0,
    rateMultiplier: 1.0,
    region: 'Nam',
    gender: 'male',
  },
  'vi-VN-HoaiMyNeural': {
    baseVoice: 'vi-VN-HoaiMyNeural',
    pitchOffsetPercent: 0,
    rateMultiplier: 1.0,
    region: 'Bắc',
    gender: 'female',
  },
  'vi-VN-AnhTuyet-Southern': {
    baseVoice: 'vi-VN-HoaiMyNeural',
    pitchOffsetPercent: 0,
    rateMultiplier: 1.0,
    region: 'Nam',
    gender: 'female',
  },
  'vi-VN-QuocBao-Southern': {
    baseVoice: 'vi-VN-NamMinhNeural',
    pitchOffsetPercent: 0,
    rateMultiplier: 1.0,
    region: 'Nam',
    gender: 'male',
  },
  'vi-VN-NamMinhNeural': {
    baseVoice: 'vi-VN-NamMinhNeural',
    pitchOffsetPercent: 0,
    rateMultiplier: 1.0,
    region: 'Bắc',
    gender: 'male',
  },
};

let edgeTtsChain: Promise<any> = Promise.resolve();

async function synthesizeEdgeDirectRaw(
  chunkText: string,
  voice: string,
  userPitch = 1.0,
  userRate = 1.0,
  userVolume = 1.0,
  timeoutMs = 7500
): Promise<Buffer> {
  const profile = EDGE_VOICE_PROFILES[voice] || EDGE_VOICE_PROFILES['vi-VN-HoaiMyNeural'];
  const chosenBaseVoice = profile.baseVoice;

  const prosodyRateVal = Number((userRate * profile.rateMultiplier).toFixed(2));
  const ratePercent = Math.round((prosodyRateVal - 1.0) * 100);
  const ssmlRate = `${ratePercent >= 0 ? '+' : ''}${ratePercent}%`;

  const userPitchDeltaPercent = Math.round((userPitch - 1.0) * 40);
  const totalPitchPercent = userPitchDeltaPercent + profile.pitchOffsetPercent;
  const ssmlPitch = `${totalPitchPercent >= 0 ? '+' : ''}${totalPitchPercent}%`;

  const prosodyVolume = Math.round(Math.min(1.0, Math.max(0, userVolume)) * 100);
  const ssmlVolume = `${prosodyVolume}%`;

  const cleanedRaw = sanitizeTextForTts(chunkText);
  const safeChunk = escapeXmlText(cleanedRaw);
  const hasSpeakableContent = /[\p{L}\p{N}]/u.test(cleanedRaw);
  const secMsGEC = generateSecMsGecV2();
  const muid = generateEdgeMuid();
  const reqId = crypto.randomUUID().replace(/-/g, '');
  const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${encodeURIComponent(secMsGEC)}&Sec-MS-GEC-Version=2-143.0.3650.75&ConnectionId=${reqId}`;

  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        Cookie: `muid=${muid};`,
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
      },
    });

    const audioChunks: Buffer[] = [];
    let hasSettled = false;
    let receivedTurnEnd = false;
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN"><voice name="${chosenBaseVoice}"><prosody pitch="${ssmlPitch}" rate="${ssmlRate}" volume="${ssmlVolume}">${safeChunk}</prosody></voice></speak>`;

    const settleResolve = (data: Buffer) => {
      if (!hasSettled) {
        hasSettled = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {}
        resolve(data);
      }
    };

    const settleReject = (err: Error) => {
      if (!hasSettled) {
        hasSettled = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {}
        reject(err);
      }
    };

    const timeout = setTimeout(() => {
      // Never accept partial audio if Path:turn.end was not received
      settleReject(new Error('Edge TTS WebSocket timed out before stream completed (turn.end missing)'));
    }, timeoutMs);

    ws.on('open', () => {
      const configMsg = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMsg, () => {
        const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      });
    });

    ws.on('message', (data: any) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const str = buf.toString('utf8', 0, Math.min(buf.length, 300));

      if (str.includes('Path:turn.end')) {
        receivedTurnEnd = true;
        const fullAudio = Buffer.concat(audioChunks);
        if (hasSpeakableContent && fullAudio.length < 128) {
          settleReject(new Error('Edge TTS returned empty or truncated audio despite turn.end'));
          return;
        }
        settleResolve(fullAudio);
        return;
      }

      if (buf.length >= 2) {
        const headerLen = buf.readUInt16BE(0);
        if (headerLen < buf.length && buf.length >= 2 + headerLen) {
          const headerStr = buf.subarray(2, 2 + headerLen).toString('utf8');
          if (headerStr.includes('Path:audio')) {
            const audio = buf.subarray(2 + headerLen);
            if (audio.length > 0) audioChunks.push(audio);
          }
        }
      }
    });

    ws.on('error', (err) => {
      settleReject(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on('close', () => {
      if (!receivedTurnEnd) {
        // Reject even if partial audio chunks arrived, so no sentences are silently skipped
        settleReject(new Error('Edge TTS WebSocket closed prematurely before turn.end'));
      }
    });
  });
}

export async function synthesizeEdgeDirect(
  chunkText: string,
  voice: string,
  userPitch = 1.0,
  userRate = 1.0,
  userVolume = 1.0,
  timeoutMs = 7500
): Promise<Buffer> {
  const currentTask = edgeTtsChain.then(async () => {
    const startedAt = Date.now();
    try {
      return await synthesizeEdgeDirectRaw(chunkText, voice, userPitch, userRate, userVolume, timeoutMs);
    } catch (firstErr) {
      // Only do a fast inline retry if the first attempt failed quickly (< 3s)
      if (Date.now() - startedAt < 3000) {
        await new Promise((r) => setTimeout(r, 150));
        return await synthesizeEdgeDirectRaw(chunkText, voice, userPitch, userRate, userVolume, timeoutMs);
      }
      throw firstErr;
    }
  });

  edgeTtsChain = currentTask.catch(() => {});
  return currentTask;
}

const ttsAudioCache = new Map<string, { audioBase64: string; mimeType: string; sampleRate: number; voice: string; isFallback?: boolean; fallbackVoiceName?: string; fallbackReason?: string; success: boolean }>();

export async function synthesizeEdgeSpeechPayload(params: {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  strict?: boolean;
}) {
  const {
    text,
    voice = 'vi-VN-HoaiMyNeural',
    rate = 1.0,
    pitch = 1.0,
    volume = 1.0,
    strict = false,
  } = params;

  const cleanText = sanitizeTextForTts(text);
  const cacheKey = `edge_v2_${strict ? 'strict_' : ''}${voice}_${rate}_${pitch}_${volume}_${cleanText}`;
  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey)!;
  }

  const maxChunkChars = strict ? 350 : 1000;
  const maxSentChars = strict ? 320 : 900;
  const maxWordChunkChars = strict ? 300 : 800;

  const chunks: string[] = [];
  if (cleanText.length <= maxChunkChars) {
    chunks.push(cleanText);
  } else {
    const sentences = cleanText.split(/(?<=[.?!;\n])\s+/);
    let currentChunk = '';
    for (const sent of sentences) {
      if ((currentChunk + ' ' + sent).trim().length <= maxSentChars) {
        currentChunk = (currentChunk + ' ' + sent).trim();
      } else {
        if (currentChunk) chunks.push(currentChunk);
        if (sent.length > maxSentChars) {
          const words = sent.split(/\s+/);
          let sub = '';
          for (const w of words) {
            if ((sub + ' ' + w).trim().length <= maxWordChunkChars) {
              sub = (sub + ' ' + w).trim();
            } else {
              if (sub) chunks.push(sub);
              sub = w;
            }
          }
          if (sub) chunks.push(sub);
          currentChunk = '';
        } else {
          currentChunk = sent;
        }
      }
    }
    if (currentChunk) chunks.push(currentChunk);
  }

  const audioBuffers: Buffer[] = [];
  let usedGoogleFallback = false;
  const edgeTimeoutMs = strict ? 7500 : 6500;

  for (const chunk of chunks) {
    const trimmedChunk = chunk.trim();
    if (!trimmedChunk || !/[\p{L}\p{N}]/u.test(trimmedChunk)) continue;
    let edgeBuffer: Buffer | null = null;
    let lastEdgeError: unknown = null;

    try {
      edgeBuffer = await synthesizeEdgeDirect(trimmedChunk, voice, pitch, rate, volume, edgeTimeoutMs);
    } catch (err) {
      lastEdgeError = err;
    }

    if (edgeBuffer && edgeBuffer.length > 0) {
      audioBuffers.push(edgeBuffer);
      continue;
    }

    if (strict) {
      const reason = lastEdgeError instanceof Error ? lastEdgeError.message : 'Timeout/WebSocket closed';
      throw new Error(`Không thể kết nối trọn vẹn giọng Microsoft Edge (${reason}). Đã dừng để tránh bỏ sót câu hoặc lẫn giọng khác.`);
    }

    // Fallback to Google Translate TTS (live reading mode only)
    try {
      const fb = await fetchGoogleTranslateAudio(trimmedChunk);
      if (fb && fb.length > 0) {
        audioBuffers.push(fb);
        usedGoogleFallback = true;
      }
    } catch {}
  }

  if (audioBuffers.length === 0) {
    if (strict) {
      throw new Error('Không nhận được dữ liệu âm thanh trọn vẹn từ giọng Microsoft Edge đã chọn.');
    }
    const fb = await fetchGoogleTranslateAudio(cleanText);
    audioBuffers.push(fb);
    usedGoogleFallback = true;
  }

  if (strict && usedGoogleFallback) {
    throw new Error('Phát hiện giọng dự phòng trong chế độ khóa cứng giọng Edge.');
  }

  const fullAudioBuffer = Buffer.concat(audioBuffers);
  const resultObj = {
    audioBase64: fullAudioBuffer.toString('base64'),
    mimeType: 'audio/mp3',
    sampleRate: 24000,
    voice,
    isFallback: usedGoogleFallback,
    fallbackVoiceName: usedGoogleFallback ? 'Google Dịch TTS (Dự phòng)' : undefined,
    fallbackReason: usedGoogleFallback ? 'Động cơ Edge TTS gặp sự cố mạng, tạm dùng Google Dịch' : undefined,
    success: true,
  };

  if (ttsAudioCache.size > 150) {
    const firstKey = ttsAudioCache.keys().next().value;
    if (firstKey) ttsAudioCache.delete(firstKey);
  }
  ttsAudioCache.set(cacheKey, resultObj);

  return resultObj;
}

export async function synthesizeGoogleTranslatePayload(params: {
  text: string;
  voice?: string;
  strict?: boolean;
}) {
  const { text, voice = 'google_translate_vi', strict = false } = params;
  const cleanText = text.trim();
  const cacheKey = `gt_${strict ? 'strict_' : ''}${voice}_${cleanText}`;
  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey)!;
  }

  let fullAudioBuffer: Buffer;
  if (voice === 'google_translate_vi_south_male' || voice.includes('south_male')) {
    if (strict) {
      fullAudioBuffer = await synthesizeEdgeDirect(cleanText, 'vi-VN-NamMinhNeural', 1.0, 0.96, 1.0, 9000);
    } else {
      try {
        fullAudioBuffer = await synthesizeEdgeDirect(cleanText, 'vi-VN-NamMinhNeural', 1.0, 0.96, 1.0);
      } catch {
        fullAudioBuffer = await fetchGoogleTranslateAudio(cleanText);
      }
    }
  } else if (voice === 'google_translate_vi_south_female' || voice.includes('south_female')) {
    if (strict) {
      fullAudioBuffer = await synthesizeEdgeDirect(cleanText, 'vi-VN-MaiLinh-Southern', 1.0, 1.0, 1.0, 9000);
    } else {
      try {
        fullAudioBuffer = await synthesizeEdgeDirect(cleanText, 'vi-VN-MaiLinh-Southern', 1.0, 1.0, 1.0);
      } catch {
        fullAudioBuffer = await fetchGoogleTranslateAudio(cleanText);
      }
    }
  } else {
    if (strict) {
      try {
        fullAudioBuffer = await fetchGoogleTranslateAudio(cleanText);
      } catch {
        await new Promise((r) => setTimeout(r, 300));
        fullAudioBuffer = await fetchGoogleTranslateAudio(cleanText);
      }
      if (!fullAudioBuffer || fullAudioBuffer.length === 0) {
        throw new Error('Không nhận được dữ liệu âm thanh từ Google Dịch TTS.');
      }
    } else {
      try {
        fullAudioBuffer = await fetchGoogleTranslateAudio(cleanText);
      } catch {
        fullAudioBuffer = await synthesizeEdgeDirect(cleanText, 'vi-VN-HoaiMyNeural', 1.0, 1.0, 1.0);
      }
    }
  }

  const resultObj = {
    audioBase64: fullAudioBuffer.toString('base64'),
    mimeType: 'audio/mp3',
    sampleRate: 24000,
    voice,
    isFallback: false,
    success: true,
  };

  if (ttsAudioCache.size > 150) {
    const firstKey = ttsAudioCache.keys().next().value;
    if (firstKey) ttsAudioCache.delete(firstKey);
  }
  ttsAudioCache.set(cacheKey, resultObj);

  return resultObj;
}

export async function extractWebArticleServer(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  if (!response.ok) {
    const err: any = new Error(`Không thể tải trang web (Mã lỗi: ${response.status} ${response.statusText}). Vui lòng kiểm tra lại đường dẫn.`);
    err.statusCode = response.status;
    throw err;
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  $(
    'script, style, noscript, svg, iframe, form, button, nav, header, footer, aside, .header, .footer, .sidebar, .menu, .nav, .ad, .ads, .advertisement, .banner, .social-share, .relative-news, .box-comment, .comment, .related, .author-box'
  ).remove();

  let title =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('h1.title-detail, h1.article-title, h1.detail-title, h1.post-title, h1').first().text().trim() ||
    $('title').text().trim() ||
    'Bài viết web';

  title = title.replace(/\s*[-|]\s*(VnExpress|Tuổi Trẻ|Dân Trí|Vietnamnet|Thanh Niên|Zing|Kênh 14|Báo|Truyện Cổ Tích).*$/i, '').trim();

  const candidates = [
    'article',
    '.fck_detail',
    '.detail-content',
    '.article-content',
    '.content-detail',
    '.detail__content',
    '.post-content',
    '.entry-content',
    '.story-body',
    'main',
    '#main-content',
    '.main-content',
  ];

  let mainElement: cheerio.Cheerio<any> | null = null;
  for (const sel of candidates) {
    const el = $(sel);
    if (el.length > 0 && el.text().trim().length > 200) {
      mainElement = el;
      break;
    }
  }

  const paragraphs: string[] = [];
  const description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('.description, .lead, .sapo, .detail-sapo, .article-sapo').first().text().trim();

  if (description && description.length > 20) {
    paragraphs.push(description);
  }

  if (mainElement) {
    mainElement.find('p, h2, h3, h4, blockquote, li').each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > 15 && !paragraphs.includes(t)) {
        paragraphs.push(t);
      }
    });
  } else {
    $('p').each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > 25 && !paragraphs.includes(t)) {
        paragraphs.push(t);
      }
    });
  }

  let articleText = paragraphs.join('\n\n');
  if (!articleText || articleText.length < 50) {
    articleText = $('body').text().replace(/\s+/g, ' ').trim();
  }

  const wordCount = articleText.split(/\s+/).filter(Boolean).length;
  return {
    title,
    text: articleText,
    url,
    wordCount,
    success: true,
  };
}

export function splitChaptersServer(text: string) {
  const chapterRegex = /(?:\n|^)(Chương\s+\d+|Hồi\s+\d+|Phần\s+\d+|Mục\s+\d+|Tiết\s+\d+|Chapter\s+\d+|Bài\s+\d+[:\s\.\-][^\n]*)/gi;
  const matches = Array.from(text.matchAll(chapterRegex));

  if (matches.length >= 2) {
    const chapters: { title: string; content: string }[] = [];
    for (let i = 0; i < matches.length; i++) {
      const matchObj = matches[i] as any;
      const startIndex = matchObj.index ?? 0;
      const endIndex = i < matches.length - 1 ? ((matches[i + 1] as any).index ?? text.length) : text.length;
      const title = (matchObj[0] as string).trim();
      const content = text.slice(startIndex, endIndex).trim();
      chapters.push({ title, content });
    }
    return { chapters, method: 'regex', success: true };
  }

  const paragraphs = text.split(/\n\s*\n+/);
  const chapters: { title: string; content: string }[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  let chapterIndex = 1;

  for (const p of paragraphs) {
    const pWords = p.trim().split(/\s+/).length;
    if (currentWordCount + pWords > 800 && currentChunk.length > 0) {
      chapters.push({
        title: `Phần ${chapterIndex}`,
        content: currentChunk.join('\n\n'),
      });
      chapterIndex++;
      currentChunk = [p.trim()];
      currentWordCount = pWords;
    } else {
      currentChunk.push(p.trim());
      currentWordCount += pWords;
    }
  }

  if (currentChunk.length > 0) {
    chapters.push({
      title: `Phần ${chapterIndex}`,
      content: currentChunk.join('\n\n'),
    });
  }

  return { chapters, method: 'chunking', success: true };
}
