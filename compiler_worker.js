var Module = { locateFile: (path) => path };
self.importScripts('shared.js');

const apiOptions = {
  async readBuffer(filename) {
    const response = await fetch(filename); 
    return response.ok ? response.arrayBuffer() : new ArrayBuffer(0);
  },
  async compileStreaming(filename) {
    const response = await fetch(filename);
    return WebAssembly.compile(await response.arrayBuffer());
  },
  hostWrite(s) { 
    if (!s.includes('\x1b') && !s.toLowerCase().includes('done.')) {
        self.postMessage({type : 'stdout', output : s}); 
    }
  },
};

let api = new API(apiOptions);

self.onmessage = async event => {
  if (event.data.action === 'compile-and-run') {
    try {
      await api.compileLinkRun(event.data.contents, event.data.input);
      self.postMessage({type: 'done'});
    } catch (err) {
      // Send the full error string for better debugging.
      self.postMessage({type: 'stderr', output: err.toString()});
      self.postMessage({type: 'done'});
    }
  }
};