var Module = { locateFile: (path) => path };
// Import pako for decompression, and then our shared API logic.
// Load pako from a reliable CDN to avoid local hosting issues and potential 404 errors.
self.importScripts('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', 'shared.js');

// --- Output Buffering to prevent UI freezing from infinite loops ---
let stdoutBuffer = '';
let stderrBuffer = '';
const BUFFER_FLUSH_THRESHOLD = 1024; // Flush after 1KB to be more responsive

// This function can be called to force a flush, e.g., at the end of execution.
function flushAllBuffers() {
    if (stdoutBuffer.length > 0) {
        self.postMessage({ type: 'stdout', output: stdoutBuffer });
        stdoutBuffer = '';
    }
    if (stderrBuffer.length > 0) {
        self.postMessage({ type: 'stderr', output: stderrBuffer });
        stderrBuffer = '';
    }
}
const apiOptions = {
  // Point to the compressed clang binary. The API will use this filename.
  clang: 'clang.wasm.gz',
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
    // Clang errors are colored red with ANSI codes.
    // \x1b[91m is bright red. We'll treat any such message as an error.
    // Buffer output instead of sending it immediately to prevent UI freezing.
    if (s.includes('\x1b[91m')) {
        stderrBuffer += s;
    } else if (!s.includes('\x1b') && !s.toLowerCase().includes('done.')) {
        stdoutBuffer += s;
    }

    // To prevent the UI from freezing on programs with a lot of output (like infinite loops),
    // we flush the buffer from within hostWrite if it exceeds a certain size.
    // This works because hostWrite is called synchronously from the Wasm module,
    // bypassing the blocked worker event loop.
    if (stdoutBuffer.length > BUFFER_FLUSH_THRESHOLD) {
        self.postMessage({ type: 'stdout', output: stdoutBuffer });
        stdoutBuffer = '';
    }
    if (stderrBuffer.length > BUFFER_FLUSH_THRESHOLD) {
        self.postMessage({ type: 'stderr', output: stderrBuffer });
        stderrBuffer = '';
    }
  },
};

let api = new API(apiOptions);

self.onmessage = async event => {
  if (event.data.action === 'constructor') {
    // Signal back to the main thread that the worker is loaded and ready to receive commands.
    self.postMessage({ type: 'ready' });
  }
  else if (event.data.action === 'compile-and-run') {
    try {
      // Pass language to compileLinkRun
      await api.compileLinkRun(event.data.contents, event.data.input, event.data.language);
    } catch (err) {
      // Send a cleaner error message for unexpected failures.
      self.postMessage({type: 'stderr', output: `\nAn unexpected error occurred: ${err.toString()}\n`});
    } finally {
      // Flush any remaining buffered output before signaling completion.
      flushAllBuffers();
      self.postMessage({type: 'done'});
    }
  }
};