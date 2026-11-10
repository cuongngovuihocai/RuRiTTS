import { Mp3Encoder } from '@breezystack/lamejs';
import { EmotionStyle, VietnameseVoice, VoiceSettings } from '../types';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1. Accessibility Audio Feedback Beeps (Phản hồi âm thanh trợ năng)
export function playSoundCue(
  type: 'play' | 'pause' | 'click' | 'bookmark' | 'clean' | 'success' | 'error' | 'chapter'
) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case 'play':
        // Ascending double beep (C5 -> G5)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
        break;

      case 'pause':
        // Descending double tone (G5 -> E4)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(783.99, now);
        osc.frequency.exponentialRampToValueAtTime(329.63, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
        break;

      case 'click':
        // Crisp tactile click
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;

      case 'bookmark':
        // Pleasant bell chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.setValueAtTime(1046.5, now + 0.08); // C6
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;

      case 'clean':
        // Magic sparkle sound
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
        break;

      case 'success':
        // Major triad fanfare
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        osc.frequency.setValueAtTime(1046.5, now + 0.24); // C6
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
        break;

      case 'chapter':
        // Deep gong
        osc.type = 'sine';
        osc.frequency.setValueAtTime(392.0, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        break;

      case 'error':
        // Low buzz warning
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.setValueAtTime(140, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
    }
  } catch (e) {
    console.warn('Could not play sound cue:', e);
  }
}

// 2. Announce Voice Assistant messages for visually impaired
export function speakAnnouncement(
  message: string,
  settings: VoiceSettings,
  onComplete?: () => void
) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = 'vi-VN';
  utterance.rate = 1.1;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Try to find a Vietnamese voice
  const voices = window.speechSynthesis.getVoices();
  const viVoice = voices.find((v) => v.lang.startsWith('vi') || v.name.toLowerCase().includes('vietnam'));
  if (viVoice) {
    utterance.voice = viVoice;
  }

  if (onComplete) {
    utterance.onend = () => onComplete();
    utterance.onerror = () => onComplete();
  }

  window.speechSynthesis.speak(utterance);
}

// 2.5 Acoustic presets for Emotion and Tone Styles
export interface EmotionAcoustics {
  rateMultiplier: number;
  pitchMultiplier: number;
  volumeMultiplier: number;
  pauseAfterSentenceMs: number;
  textPrefix: string;
}

export function getEmotionAcoustics(emotion: EmotionStyle): EmotionAcoustics {
  switch (emotion) {
    case 'expressive':
      // Truyền cảm sâu lắng: tiết tấu nhịp nhàng, cao độ hơi hạ trầm, âm lượng đầy đặn
      return {
        rateMultiplier: 0.95,
        pitchMultiplier: 0.96,
        volumeMultiplier: 1.0,
        pauseAfterSentenceMs: 0,
        textPrefix: '',
      };
    case 'storytelling':
      // Trầm ấm kể chuyện: đọc chậm rãi vừa phải, cao độ trầm ấm
      return {
        rateMultiplier: 0.90,
        pitchMultiplier: 0.92,
        volumeMultiplier: 1.0,
        pauseAfterSentenceMs: 0,
        textPrefix: '',
      };
    case 'dramatic':
      // Kịch tính & Hồi hộp: tiết tấu dồn dập hơn, nhấn nhá cao độ mạnh mẽ
      return {
        rateMultiplier: 1.12,
        pitchMultiplier: 1.06,
        volumeMultiplier: 1.0,
        pauseAfterSentenceMs: 0,
        textPrefix: '',
      };
    case 'calm':
      // Thanh thản & Dịu nhẹ: nhịp điệu chậm, êm dịu, thư thái
      return {
        rateMultiplier: 0.85,
        pitchMultiplier: 0.95,
        volumeMultiplier: 0.90,
        pauseAfterSentenceMs: 0,
        textPrefix: '',
      };
    case 'whisper':
      // Thì thầm đêm khuya: âm lượng nhỏ nhẹ, giọng trầm nhẹ
      return {
        rateMultiplier: 0.82,
        pitchMultiplier: 0.88,
        volumeMultiplier: 0.75,
        pauseAfterSentenceMs: 0,
        textPrefix: '',
      };
    case 'cheerful':
      // Vui tươi & Phấn chấn: tốc độ nhanh nhẹn, cao độ tươi sáng vui vẻ
      return {
        rateMultiplier: 1.15,
        pitchMultiplier: 1.12,
        volumeMultiplier: 1.0,
        pauseAfterSentenceMs: 0,
        textPrefix: '',
      };
    case 'natural':
    default:
      return {
        rateMultiplier: 1.0,
        pitchMultiplier: 1.0,
        volumeMultiplier: 1.0,
        pauseAfterSentenceMs: 0,
        textPrefix: '',
      };
  }
}

// 3. Detect Available Vietnamese Voices (Microsoft Edge, Google Translate, Native Device)
export function getEdgeVoices(): VietnameseVoice[] {
  return [
    {
      id: 'vi-VN-MaiLinh-Southern',
      name: 'Mai Linh',
      lang: 'vi-VN',
      gender: 'female',
      region: 'Toàn quốc',
      engine: 'edge',
      isOfflineSupported: false,
      isRecommended: true,
      description: 'Giọng nữ Mai Linh ngọt ngào, dịu dàng từ Microsoft Edge',
    },
    {
      id: 'vi-VN-AnhTuyet-Southern',
      name: 'Ánh Tuyết',
      lang: 'vi-VN',
      gender: 'female',
      region: 'Toàn quốc',
      engine: 'edge',
      isOfflineSupported: false,
      description: 'Giọng nữ Ánh Tuyết thanh thoát, nhẹ nhàng từ Microsoft Edge',
    },
    {
      id: 'vi-VN-HoaiMyNeural',
      name: 'Hoài My',
      lang: 'vi-VN',
      gender: 'female',
      region: 'Toàn quốc',
      engine: 'edge',
      isOfflineSupported: false,
      isRecommended: true,
      description: 'Giọng nữ Hoài My chuẩn mực từ Microsoft Edge',
    },
    {
      id: 'vi-VN-MinhQuang-Southern',
      name: 'Minh Quang',
      lang: 'vi-VN',
      gender: 'male',
      region: 'Toàn quốc',
      engine: 'edge',
      isOfflineSupported: false,
      isRecommended: true,
      description: 'Giọng nam Minh Quang ấm áp từ Microsoft Edge',
    },
  ];
}

export function getVoiceSamplePreviewText(voice: VietnameseVoice): string {
  switch (voice.id) {
    // 🌟 Microsoft Edge Miền Nam
    case 'vi-VN-MaiLinh-Southern':
      return 'Dạ em chào anh chị, đây là giọng Mai Linh.';
    case 'vi-VN-AnhTuyet-Southern':
      return 'Chào bạn nghen, đây là giọng Ánh Tuyết.';
    case 'vi-VN-MinhQuang-Southern':
      return 'Xin chào quý vị, đây là giọng Minh Quang.';

    // 🌟 Microsoft Edge Giọng Miền Bắc
    case 'vi-VN-HoaiMyNeural':
      return 'Xin chào bạn, đây là giọng Hoài My.';
    case 'vi-VN-NamMinhNeural':
      return 'Xin chào quý vị, đây là giọng Nam Minh.';

    // 🌟 Google Translate TTS
    case 'google_translate_vi':
      return 'Xin chào, đây là giọng Google Dịch Nữ.';

    default:
      return `Xin chào, đây là giọng đọc ${voice.name}.`;
  }
}

export function getGoogleTranslateVoices(): VietnameseVoice[] {
  return [
    {
      id: 'google_translate_vi',
      name: 'Google Dịch Nữ',
      lang: 'vi-VN',
      gender: 'female',
      region: 'Bắc',
      engine: 'google-translate',
      isOfflineSupported: false,
      isRecommended: true,
      description: 'Giọng Nữ chuẩn ngữ âm tiếng Việt từ Google Dịch',
    },
  ];
}

export function getAvailableVietnameseVoices(): Promise<VietnameseVoice[]> {
  return new Promise((resolve) => {
    const edgeVoices = getEdgeVoices();
    const googleVoices = getGoogleTranslateVoices();

    if (!('speechSynthesis' in window)) {
      resolve([...edgeVoices, ...googleVoices]);
      return;
    }

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      const viVoices = allVoices.filter(
        (v) =>
          v.lang.toLowerCase().includes('vi') ||
          v.lang.toLowerCase().includes('vn') ||
          v.name.toLowerCase().includes('viet') ||
          v.name.toLowerCase().includes('tiếng việt')
      );

      const mappedNative: VietnameseVoice[] = viVoices.map((v, i) => {
        let region: 'Bắc' | 'Nam' | 'Trung' | 'Toàn quốc' = 'Toàn quốc';
        let gender: 'female' | 'male' | 'neutral' = 'neutral';
        const nameLower = v.name.toLowerCase();

        if (
          nameLower.includes('mai') ||
          nameLower.includes('linh') ||
          nameLower.includes('nu') ||
          nameLower.includes('female') ||
          nameLower.includes('hoaimy')
        ) {
          gender = 'female';
        } else if (
          nameLower.includes('nam') ||
          nameLower.includes('an') ||
          nameLower.includes('male') ||
          nameLower.includes('minh')
        ) {
          gender = 'male';
        }

        if (nameLower.includes('north') || nameLower.includes('hà nội') || nameLower.includes('bac')) {
          region = 'Bắc';
        } else if (nameLower.includes('south') || nameLower.includes('sài gòn') || nameLower.includes('nam')) {
          region = 'Nam';
        }

        return {
          id: `native_${v.name}_${v.lang}_${i}`,
          name:
            v.name.replace(/Google|Microsoft|Apple|Desktop|Natural/gi, '').trim() ||
            `Giọng máy ${i + 1}`,
          lang: v.lang,
          gender,
          region,
          engine: 'native',
          isOfflineSupported: true,
          nativeVoice: v,
          description: `${v.name} (${v.lang}) - Giọng đọc có sẵn trên thiết bị (Offline 100%)`,
        };
      });

      // If no native Vietnamese voices installed in browser, provide a fallback virtual voice
      if (mappedNative.length === 0) {
        mappedNative.push({
          id: 'native_default_vi',
          name: 'Giọng mặc định thiết bị (vi-VN)',
          lang: 'vi-VN',
          gender: 'female',
          region: 'Toàn quốc',
          engine: 'native',
          isOfflineSupported: true,
          description: 'Trình đọc tổng hợp chuẩn của hệ điều hành (Offline 100%)',
        });
      }

      // Order: Edge Neural (Southern & Original) -> Google Translate (Southern & Original) -> Native Local Device
      resolve([...edgeVoices, ...googleVoices, ...mappedNative]);
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
      };
      // Timeout fallback
      setTimeout(loadVoices, 500);
    }
  });
}

// 4. Convert Base64 MP3 / Audio to Playable AudioBuffer
export async function decodeAudioBase64(base64Audio: string): Promise<AudioBuffer> {
  const binaryString = window.atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const ctx = getAudioContext();
  return await ctx.decodeAudioData(bytes.buffer.slice(0));
}



// 5. Convert Raw PCM 16-bit 24kHz to Playable Audio Buffer & WAV Blob
export function pcmToAudioBuffer(
  base64Pcm: string,
  sampleRate: number = 24000
): AudioBuffer {
  const binaryString = window.atob(base64Pcm);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const int16Array = new Int16Array(bytes.buffer);
  const ctx = getAudioContext();
  const audioBuffer = ctx.createBuffer(1, int16Array.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < int16Array.length; i++) {
    channelData[i] = int16Array[i] / 32768.0;
  }

  return audioBuffer;
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  const channels: Float32Array[] = [];
  let sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF identifier
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  // FMT sub-chunk
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // 16 for PCM
  setUint16(1); // Linear quantization (PCM)
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // 16-bit

  // data sub-chunk
  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([outBuffer], { type: 'audio/wav' });
}

export function createWavBlobFromPcmBase64(base64Pcm: string, sampleRate = 24000): Blob {
  const buffer = pcmToAudioBuffer(base64Pcm, sampleRate);
  return audioBufferToWavBlob(buffer);
}

export function base64ToBlob(base64Data: string, mimeType: string = 'audio/mp3'): Blob {
  const binaryString = window.atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function audioBufferToMp3Blob(buffer: AudioBuffer, kbps: number = 128): Blob {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const mp3encoder = new Mp3Encoder(channels, sampleRate, kbps);
  const mp3Data: Uint8Array[] = [];

  const sampleCount = buffer.length;
  const left = buffer.getChannelData(0);
  const leftInt16 = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const s = Math.max(-1, Math.min(1, left[i]));
    leftInt16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const blockSize = 1152;

  if (channels === 1) {
    for (let i = 0; i < sampleCount; i += blockSize) {
      const chunk = leftInt16.subarray(i, Math.min(i + blockSize, sampleCount));
      const mp3buf = mp3encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Data.push(new Uint8Array(mp3buf));
      }
    }
  } else {
    const right = buffer.getChannelData(1);
    const rightInt16 = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      const s = Math.max(-1, Math.min(1, right[i]));
      rightInt16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    for (let i = 0; i < sampleCount; i += blockSize) {
      const leftChunk = leftInt16.subarray(i, Math.min(i + blockSize, sampleCount));
      const rightChunk = rightInt16.subarray(i, Math.min(i + blockSize, sampleCount));
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(new Uint8Array(mp3buf));
      }
    }
  }

  const endBuf = mp3encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(new Uint8Array(endBuf));
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
}

export function createMp3BlobFromPcmBase64(base64Pcm: string, sampleRate = 24000): Blob {
  const buffer = pcmToAudioBuffer(base64Pcm, sampleRate);
  return audioBufferToMp3Blob(buffer);
}
