import { explainFinding } from "../lib/watsonx";

async function run() {
  // Minimal inference probe — single short security finding.
  try {
    const result = await explainFinding("AG-001: The tool declares exec:shell.");
    if (result.live) {
      console.log("API health: HEALTHY");
      console.log("Inference test: SUCCESS");
      console.log("Model response (truncated):", result.text.slice(0, 120));
    } else {
      console.log("API health: FAILED");
      console.log("Inference test: FAILED");
      console.log("Error: fallback returned — BOB_API_KEY not recognised or missing");
    }
  } catch (err) {
    console.log("API health: FAILED");
    console.log("Inference test: FAILED");
    console.log("Error:", err instanceof Error ? err.message : String(err));
  }
}

run();
