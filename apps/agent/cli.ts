import * as readline from 'readline';
// We will build the actual processMessage logic in Step 4
import { processMessage } from './main.js'; 

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("🤖 Alexa+ Agent CLI (Terminal Mode) started.");
console.log("Type your command below, or type 'exit' to quit.\n");

function promptUser() {
  rl.question('You: ', async (input) => {
    if (input.toLowerCase() === 'exit') {
      console.log("Shutting down CLI...");
      rl.close();
      return;
    }
    
    try {
      // Sends the terminal text to your Bedrock/OpenAI orchestrator
      const response = await processMessage(input);
      console.log(`\nAgent: ${response}\n`);
    } catch (error) {
      console.error(`\n[System Error]: ${error}\n`);
    }
    
    promptUser(); // Loop back for the next command
  });
}

promptUser();