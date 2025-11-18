class CanvasRenderingContext2DMock {
  fillRect() {}
  clearRect() {}
  getImageData() {
    return { data: [] };
  }
  putImageData() {}
  createImageData() {
    return [];
  }
  setTransform() {}
  drawImage() {}
  save() {}
  fillText() {}
  restore() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  closePath() {}
  stroke() {}
  translate() {}
  scale() {}
  rotate() {}
  arc() {}
  fill() {}
  measureText() {
    return { width: 0 };
  }
  transform() {}
  rect() {}
  clip() {}
}

export class CanvasMock {
  width = 0;
  height = 0;
  getContext() {
    return new CanvasRenderingContext2DMock();
  }
  toBuffer() {
    return Buffer.from([]);
  }
  createPNGStream() {
    return Buffer.from([]);
  }
  toDataURL() {
    return '';
  }
}

export class ImageMock {
  src = '';
}

export const Image = ImageMock;
export const Canvas = CanvasMock;

export function createCanvas(width: number, height: number) {
  const canvas = new CanvasMock();
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function loadImage() {
  return Promise.resolve(new ImageMock());
}

export default {
  Canvas: CanvasMock,
  Image: ImageMock,
  createCanvas,
  loadImage,
};
