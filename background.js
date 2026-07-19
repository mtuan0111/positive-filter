chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkText") {
      chrome.storage.local.get(['geminiApiKey'], async (result) => {
        if (!result.geminiApiKey) {
          sendResponse({ error: "No API key found." });
          return;
        }
  
        const apiKey = result.geminiApiKey;
        const textToCheck = request.text;
        
        // The prompt asks Gemini to classify the text and return JSON
        const prompt = `Analyze the following text. Does it contain information that makes the reader feel bad/negative, OR is it considered "useless information"?
        Evaluate as TRUE if the text meets ANY of the following criteria:
        1. Negative/Bad Feelings: The content is toxic, distressing, depressing, fear-mongering, or designed to make the reader feel upset, angry, or anxious.
        2. Useless Information: The content is "trash news", clickbait, petty gossip, sensationalized trivial matters, or uses manipulative tactics like withholding information just to force a click.
        Text: "${textToCheck}"`;
  
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { response_mime_type: "application/json" } // Forces JSON output
            })
          });
  
          const data = await response.json();
          const rawText = data.candidates[0].content.parts[0].text;
          const parsed = JSON.parse(rawText);
          
          sendResponse({ isNegative: parsed.isNegative });
        } catch (error) {
          console.error("Gemini API Error:", error);
          sendResponse({ error: "Failed to fetch from Gemini." });
        }
      });
  
      return true; // Keeps the message channel open for the async response
    }
  });