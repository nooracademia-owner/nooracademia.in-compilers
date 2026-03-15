let worker;
let executionTimeoutId = null;
const appLoader = document.getElementById('app-loader');
const EXECUTION_TIMEOUT = 60000; // 1 minute
const outputBox = document.getElementById('output');
const stdinBox = document.getElementById('stdin-input');
const runButton = document.getElementById('runBtn');
const copyButton = document.getElementById('copyBtn');
const clearButton = document.getElementById('clearBtn');
const languageSelector = document.getElementById('languageSelector');
const copyCodeButton = document.getElementById('copyCodeBtn');
const downloadButton = document.getElementById('downloadBtn');
const shareButton = document.getElementById('shareBtn');
const settingsButton = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsButton = document.getElementById('closeSettingsBtn');
const editorThemeSelector = document.getElementById('editorThemeSelector');
const fontSizeInput = document.getElementById('fontSizeInput');
const resetSettingsButton = document.getElementById('resetSettingsBtn');
const menuToggle = document.getElementById('menuToggle');
const nav = document.querySelector('nav');
const killButton = document.getElementById('killBtn');
const spinner = document.getElementById('spinner');

let editorReady = false;
let workerReady = false;

function hideLoaderIfReady() {
    if (editorReady && workerReady) {
        appLoader.classList.add('hidden');
        // Optional: remove from DOM after transition to prevent interference
        setTimeout(() => {
            appLoader.style.display = 'none';
        }, 500); // Must match CSS transition duration
    }
}

function terminateExecution(message) {
    if (executionTimeoutId) {
        clearTimeout(executionTimeoutId);
        executionTimeoutId = null;
    }
    if (worker) {
        worker.terminate();
    }
    outputBox.appendChild(document.createTextNode(message));
    runButton.disabled = false;
    killButton.disabled = true;
    spinner.classList.remove('visible');
    initializeWorker(); // Prepare for the next run
}

function onWorkerMessage(e) {
    const { type, output } = e.data;
    switch (type) {
        case 'stdout':
            // Append as a text node to prevent interpreting HTML from user code
            outputBox.appendChild(document.createTextNode(output));
            break;
        case 'stderr':
            // Differentiate errors for clarity by wrapping in a styled span
            const errorSpan = document.createElement('span');
            errorSpan.className = 'error-message';
            // Clean ANSI color codes from the string for display
            const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
            errorSpan.textContent = cleanOutput;
            outputBox.appendChild(errorSpan);
            break;
        case 'stdin':
            // This case is for future interactive input.
            const userInput = prompt("Program is requesting input (scanf):");
            worker.postMessage({ action: 'stdin-reply', value: (userInput || '') + '\n' });
            break;
        case 'ready':
            workerReady = true;
            hideLoaderIfReady();
            break;
        case 'done':
            if (executionTimeoutId) {
                clearTimeout(executionTimeoutId);
                executionTimeoutId = null;
            }
            outputBox.appendChild(document.createTextNode("\n--- Execution Finished ---\n"));
            runButton.disabled = false;
            killButton.disabled = true;
            spinner.classList.remove('visible');
            break;
    }
}
function initializeWorker() {
    worker = new Worker('compiler_worker.js');
    worker.postMessage({ action: 'constructor', data: 'main' });
    worker.onmessage = onWorkerMessage;
}
// localStorage keys
const LS_CODE_KEY_PREFIX = 'noor-compiler-code-';
const LS_LANG_KEY = 'noor-compiler-language';
const LS_STDIN_KEY = 'noor-compiler-stdin';
const LS_THEME_KEY = 'noor-compiler-theme';
const LS_FONT_SIZE_KEY = 'noor-compiler-font-size';

// Default settings values
const DEFAULT_THEME = 'vs-dark';
const DEFAULT_FONT_SIZE = 14;

// Helper functions for URL-safe Base64 encoding/decoding with UTF-8 support
function encode(str) {
    // btoa doesn't handle Unicode characters correctly, so we need this trick
    return btoa(unescape(encodeURIComponent(str)));
}

function decode(str) {
    try {
        // atob can throw an error if the string is not valid Base64
        return decodeURIComponent(escape(atob(str)));
    } catch (e) {
        console.error("Failed to decode Base64 string:", e);
        return ''; // Return empty string on failure
    }
}

// Monaco Editor Integration
require.config({ paths: { 'vs': 'https://nooracademia-owner.github.io/noor-vault-assets/nooracademia/static/vs' } });

const defaultCode = {
    cpp: `#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}`,
    c: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`
};

let editor; // To hold the editor instance

require(['vs/editor/editor.main'], function () {
    initializeWorker();

    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('code');
    const langFromUrl = urlParams.get('lang');
    const stdinFromUrl = urlParams.get('stdin');

    let initialLang, initialCode, initialStdin;

    if (codeFromUrl && langFromUrl) {
        // State from URL takes precedence
        initialLang = langFromUrl;
        initialCode = decode(codeFromUrl);
        initialStdin = stdinFromUrl ? decode(stdinFromUrl) : '';

        // Clean the URL so a refresh doesn't reuse the params
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        // Fallback to localStorage
        initialLang = localStorage.getItem(LS_LANG_KEY) || 'cpp';
        initialCode = localStorage.getItem(LS_CODE_KEY_PREFIX + initialLang) || defaultCode[initialLang];
        initialStdin = localStorage.getItem(LS_STDIN_KEY) || '';
    }

    languageSelector.value = initialLang;
    stdinBox.value = initialStdin;

    // Load editor settings
    const savedTheme = localStorage.getItem(LS_THEME_KEY) || DEFAULT_THEME;
    const savedFontSize = parseInt(localStorage.getItem(LS_FONT_SIZE_KEY) || DEFAULT_FONT_SIZE, 10);

    // Apply saved settings to the settings modal inputs
    editorThemeSelector.value = savedTheme;
    fontSizeInput.value = savedFontSize;

    editor = monaco.editor.create(document.getElementById('editor'), {
        value: initialCode,
        language: initialLang,
        theme: savedTheme,
        automaticLayout: true, // Ensures the editor resizes with its container
        fontSize: savedFontSize,
        minimap: {
            enabled: false
        }
    });

    // Signal that the editor is ready and check if we can hide the loader
    editorReady = true;
    hideLoaderIfReady();

    // --- Event Listeners for Saving State ---
    editor.getModel().onDidChangeContent(() => {
        localStorage.setItem(LS_CODE_KEY_PREFIX + languageSelector.value, editor.getValue());
    });
    stdinBox.addEventListener('input', () => localStorage.setItem(LS_STDIN_KEY, stdinBox.value));

    // --- Settings Modal Logic ---
    settingsButton.addEventListener('click', () => {
        settingsModal.classList.add('visible');
    });

    closeSettingsButton.addEventListener('click', () => {
        settingsModal.classList.remove('visible');
    });

    // Close modal if user clicks outside of it
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('visible');
        }
    });

    editorThemeSelector.addEventListener('change', () => {
        const newTheme = editorThemeSelector.value;
        editor.updateOptions({ theme: newTheme });
        localStorage.setItem(LS_THEME_KEY, newTheme);
    });

    fontSizeInput.addEventListener('input', () => {
        const newSize = parseInt(fontSizeInput.value, 10);
        if (newSize >= 10 && newSize <= 24) {
            editor.updateOptions({ fontSize: newSize });
            localStorage.setItem(LS_FONT_SIZE_KEY, newSize);
        }
    });

    resetSettingsButton.addEventListener('click', () => {
        // Update UI
        editorThemeSelector.value = DEFAULT_THEME;
        fontSizeInput.value = DEFAULT_FONT_SIZE;

        // Update editor
        editor.updateOptions({ theme: DEFAULT_THEME, fontSize: DEFAULT_FONT_SIZE });

        // Clear from localStorage
        localStorage.removeItem(LS_THEME_KEY);
        localStorage.removeItem(LS_FONT_SIZE_KEY);
    });

    // --- Mobile Menu Logic ---
    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent click from bubbling to the document
        const isActive = nav.classList.toggle('active');
        menuToggle.setAttribute('aria-expanded', isActive);
    });

    document.addEventListener('click', () => {
        if (nav.classList.contains('active')) {
            nav.classList.remove('active');
            menuToggle.setAttribute('aria-expanded', 'false');
        }
    });

    // The run button listener depends on the editor, so it must be inside this callback.
    runButton.addEventListener('click', () => {
        outputBox.innerHTML = ""; // Clear previous output
        runButton.disabled = true; // Prevent multiple clicks while running
        killButton.disabled = false;
        spinner.classList.add('visible'); // Show spinner

        executionTimeoutId = setTimeout(() => {
            terminateExecution("\n--- Execution timed out (60s). Potential infinite loop detected. ---\n");
        }, EXECUTION_TIMEOUT);

        const code = editor.getValue(); // Use getValue() for Monaco Editor

        // A simple check to guide the user if scanf is used without providing input.
        if (code.includes('scanf') && !stdinBox.value.trim()) {
            alert("This program seems to use scanf() for input.\n\nPlease provide all required input in the 'Test Case Input' box before clicking 'Run Program'.");
            runButton.disabled = false;
            return;
        }

        // Clean the input: remove leading/trailing newlines but add ONE at the end
        const rawInput = stdinBox.value.trim();
        const cleanInput = rawInput ? rawInput + "\n" : "";
        const language = languageSelector.value;

        worker.postMessage({
            action: 'compile-and-run',
            contents: code,
            input: cleanInput,
            language: language
        });
    });

    languageSelector.addEventListener('change', () => {
        const selectedLanguage = languageSelector.value;
        // Save the current code for the old language before switching
        const oldLanguage = editor.getModel().getLanguageId();
        localStorage.setItem(LS_CODE_KEY_PREFIX + oldLanguage, editor.getValue());

        localStorage.setItem(LS_LANG_KEY, selectedLanguage);
        monaco.editor.setModelLanguage(editor.getModel(), selectedLanguage);

        // Load saved code for the new language, or the default if none exists
        const newCode = localStorage.getItem(LS_CODE_KEY_PREFIX + selectedLanguage) || defaultCode[selectedLanguage];
        editor.setValue(newCode);
    });

    clearButton.addEventListener('click', () => {
        const currentLang = languageSelector.value;
        editor.setValue('');
        stdinBox.value = '';
        outputBox.innerHTML = '';
        // Also clear the saved state from localStorage
        localStorage.removeItem(LS_CODE_KEY_PREFIX + currentLang);
        localStorage.removeItem(LS_STDIN_KEY);
    });

    downloadButton.addEventListener('click', () => {
        const code = editor.getValue();
        const language = languageSelector.value;
        const extension = language === 'c' ? 'c' : 'cpp';
        const filename = `source.${extension}`;

        const blob = new Blob([code], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    });

    shareButton.addEventListener('click', () => {
        const code = editor.getValue();
        const language = languageSelector.value;
        const stdin = stdinBox.value;

        const encodedCode = encode(code);
        const encodedStdin = encode(stdin);

        const url = new URL('https://compiler.nooracademia.in/');
        url.search = ''; // Clear existing params to start fresh
        url.searchParams.set('lang', language);
        url.searchParams.set('code', encodedCode);
        if (stdin) {
            url.searchParams.set('stdin', encodedStdin);
        }

        navigator.clipboard.writeText(url.href).then(() => {
            // Visual feedback for the user
            const originalText = shareButton.textContent;
            shareButton.textContent = 'Link Copied!';
            shareButton.disabled = true;

            setTimeout(() => {
                shareButton.textContent = originalText;
                shareButton.disabled = false;
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy link: ', err);
            alert('Could not copy link to clipboard.');
        });
    });

    copyCodeButton.addEventListener('click', () => {
        const codeToCopy = editor.getValue();
        if (!codeToCopy) {
            return;
        }

        navigator.clipboard.writeText(codeToCopy).then(() => {
            const originalText = copyCodeButton.textContent;
            copyCodeButton.textContent = 'Copied!';
            copyCodeButton.disabled = true;

            setTimeout(() => {
                copyCodeButton.textContent = originalText;
                copyCodeButton.disabled = false;
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy code: ', err);
            alert('Could not copy code to clipboard.');
        });
    });

    killButton.addEventListener('click', () => {
        terminateExecution("\n--- Execution Terminated By User ---\n");
    });
});

copyButton.addEventListener('click', () => {
    const textToCopy = outputBox.textContent;
    if (!textToCopy) {
        return; // Don't do anything if there's nothing to copy
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
        // Visual feedback for the user
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        copyButton.disabled = true;

        setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.disabled = false;
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Could not copy text to clipboard.');
    });
});