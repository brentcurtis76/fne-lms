const { join } = require('path');
const Module = require('module');

if (!Module.__canvasMockInstalled) {
  const originalLoad = Module._load.bind(Module);
  const canvasStub = require(join(__dirname, 'canvas-stub', 'index.js'));

  Module._load = function patchedModuleLoad(request, parent, isMain) {
    if (request === 'canvas') {
      return canvasStub;
    }
    return originalLoad(request, parent, isMain);
  };

  Module.__canvasMockInstalled = true;
}
