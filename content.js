// A simple function to scan paragraphs. In a real app, you'd want to optimize this 
// so you don't hit API rate limits by scanning hundreds of elements at once.
async function scanPage() {
    
    const paragraphs = document.querySelectorAll('p, h1, h2, h3');
    
    // For demonstration, let's just check the first 5 elements to save API calls
    const elementsToCheck = Array.from(paragraphs).slice(0, 50);
  
    for (let el of elementsToCheck) {
      const text = el.innerText.trim();
      if (text.length < 20) continue; // Skip very short text
  
      chrome.runtime.sendMessage({ action: "checkText", text: text }, (response) => {
        console.log("text: ", text);
        console.log("response: ", response);
        if (response && response.isNegative) {
          // Blur the negative content and add a click-to-reveal feature
          el.style.filter = "blur(5px)";
          el.style.cursor = "pointer";
          el.title = "Flagged as negative. Click to reveal.";
          
          el.addEventListener('click', function reveal() {
            el.style.filter = "none";
            el.title = "";
            el.removeEventListener('click', reveal);
          });
        }
      });
    }
  }
  
  // Run the scan when the page loads
  window.addEventListener('load', scanPage);