const worker = new Worker('compiler_worker.js');
const outputBox = document.getElementById('output');
const stdinBox = document.getElementById('stdin-input');
const runButton = document.getElementById('runBtn');
const editor = document.getElementById('editor');

worker.postMessage({action: 'constructor', data: 'main'});

// Using addEventListener is a more robust and modern approach than inline onclick attributes.
runButton.addEventListener('click', () => {
    outputBox.textContent = "Compiling and Running...\n";
    runButton.disabled = true; // Prevent multiple clicks while running
    
    const code = editor.value;

    // A simple check to guide the user if scanf is used without providing input.
    // This helps prevent the program from hanging while waiting for input that will never come.
    if (code.includes('scanf') && !stdinBox.value.trim()) {
        alert("This program seems to use scanf() for input.\n\nPlease provide all required input in the 'Test Case Input' box before clicking 'Run Program'.");
        runButton.disabled = false;
        return;
    }
    
    // Clean the input: remove leading/trailing newlines but add ONE at the end
    const rawInput = stdinBox.value.trim();
    // Pass the initial input from the textbox. It can be empty.
    const cleanInput = rawInput ? rawInput + "\n" : "";

    worker.postMessage({ 
        action: 'compile-and-run', 
        contents: code,
        input: cleanInput 
    });
});

worker.onmessage = function(e) {
    const { type, output } = e.data;
    switch(type) {
        case 'stdout':
            outputBox.textContent += output;
            break;
        case 'stderr':
            // Differentiate errors for clarity
            outputBox.textContent += `\n[ERROR]: ${output}\n`;
            break;
        case 'stdin':
            // This case is for future interactive input.
            // The worker would postMessage({ type: 'stdin' }) when it needs input.
            const userInput = prompt("Program is requesting input (scanf):");
            worker.postMessage({ action: 'stdin-reply', value: userInput ? userInput + '\n' : '\n' });
            break;
        case 'done':
            outputBox.textContent += "\n--- Execution Finished ---\n";
            runButton.disabled = false;
            break;
    }
};