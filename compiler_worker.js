var Module = { locateFile: (path) => path };
// Import pako for decompression, and then our shared API logic.
// Load pako from a reliable CDN to avoid local hosting issues and potential 404 errors.
self.importScripts('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', 'shared.js');

const apiOptions = {
  // Point to the compressed clang binary. The API will use this filename.
  clang: 'clang.gz',
  async readBuffer(filename) {
    const response = await fetch(filename); 
    return response.ok ? response.arrayBuffer() : new ArrayBuffer(0);
  },
  async compileStreaming(filename) {
    const response = await fetch(filename);
    const buffer = await response.arrayBuffer();

    if (filename.endsWith('.gz')) {
      // Decompress gzipped files in memory before compiling to WebAssembly.
      const decompressed = pako.inflate(buffer);
      return WebAssembly.compile(decompressed);
    }
    // For non-gzipped files, compile the buffer directly.
    return WebAssembly.compile(buffer);
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