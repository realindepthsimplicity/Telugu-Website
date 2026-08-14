export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userMessage, conversationHistory } = req.body;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are a Telugu language learning assistant. Generate interactive multiple-choice or reading exercises in this exact JSON format:

{
  "type": "multiple-choice" or "reading",
  "telugu": "Telugu text (for reading) or null",
  "romanization": "Romanized form",
  "options": ["option1", "option2", "option3", "option4"],
  "correctAnswer": 0-3,
  "instruction": "Clear instruction for the learner"
}

Rules:
- For multiple-choice exercises: telugu is null, romanization is the romanized word/phrase, options are 4 Telugu script options, correctAnswer is the index of the correct Telugu script. The instruction should say "Select the correct Telugu script" or similar. DO NOT ask for English translation.
- For reading exercises: telugu is the Telugu text to read, options is null, romanization is the romanization. The instruction should be about reading/pronouncing the text, not about meaning/translation.
- NEVER ask users to find "meaning" or "translation" - this is a script learning tool, not a vocabulary tool
- Match difficulty to user's level
- Focus on topics user requests (alphabet, vowels, consonants, reading practice, etc.)
- Return ONLY valid JSON, no other text
- If user asks questions instead of practice, respond with conversational text (not JSON)`
          },
          ...conversationHistory,
          {
            role: 'user',
            content: userMessage
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7
      })
    });

    const data = await response.json();

    // Temporary debug logging - check this in Vercel's Logs tab
    console.log('Groq status:', response.status);
    console.log('Groq response:', JSON.stringify(data));

    if (!response.ok) {
      return res.status(500).json({
        error: data.error?.message || `Groq API returned status ${response.status}`
      });
    }

    if (!data.choices || !data.choices[0]) {
      return res.status(500).json({ error: 'No choices returned from Groq', raw: data });
    }

    const content = data.choices[0].message.content;

    if (!content || content.trim() === '') {
      // gpt-oss style models sometimes put the answer in reasoning instead of content
      const fallback = data.choices[0].message.reasoning
        || data.choices[0].message.reasoning_content;
      if (fallback) {
        return res.json({ type: 'conversation', content: fallback });
      }
      return res.status(500).json({ error: 'Model returned empty content', raw: data.choices[0].message });
    }

    // Try to parse as JSON (exercise) or return as text (conversation)
    try {
      const exercise = JSON.parse(content);
      return res.json({ type: 'exercise', content: exercise });
    } catch {
      return res.json({ type: 'conversation', content: content });
    }

  } catch (error) {
    console.log('Handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}
