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

class CanvasMock {
  constructor() {
    this.width = 0;
    this.height = 0;
  }

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

class ImageMock {
  constructor() {
    this.src = '';
  }
}

function createCanvas(width, height) {
  const canvas = new CanvasMock();
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage() {
  return Promise.resolve(new ImageMock());
}

module.exports = {
  Canvas: CanvasMock,
  Image: ImageMock,
  createCanvas,
  loadImage,
  default: {
    Canvas: CanvasMock,
    Image: ImageMock,
    createCanvas,
    loadImage
  }
};
