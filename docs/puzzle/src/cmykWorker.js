// Turns a drawn picture into a CMYK JPEG away from the page, so the tool keeps
// answering while a panel of 9 million pixels is converted and encoded (a few seconds).
// See cmykJpeg.js.

import { rgbaToCmyk, encodeCmykJpeg } from './cmykJpeg.js';

self.onmessage = ({ data }) => {
  if (data.ping) {
    self.postMessage({ ready: true });
    return;
  }
  const { id, rgba, width, height, quality } = data;
  try {
    const jpg = encodeCmykJpeg(rgbaToCmyk(new Uint8Array(rgba), width * height), width, height, quality);
    self.postMessage({ id, jpg: jpg.buffer }, [jpg.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
