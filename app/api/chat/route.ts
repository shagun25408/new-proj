export async function POST(request: Request) {
  try {
    const { question, history = [] } = await request.json();
    const prompt = String(question || '').trim();

    if (!prompt) {
      return Response.json({ error: 'Question is required.' }, { status: 400 });
    }

    const searchResults = await getSearchResults(prompt);
    const answer = await getGeminiAnswer(prompt, history, searchResults);

    return Response.json({
      answer,
      sources: searchResults.slice(0, 3).map((result) => result.title || result.link || 'Live web source'),
    });
  } catch (error) {
    console.error('Study Buddy API error:', error);
    return Response.json(
      {
        answer: 'The assistant is unavailable right now. Add your Gemini and SERP API keys to enable live study answers.',
        sources: [],
      },
      { status: 200 }
    );
  }
}

async function getGeminiAnswer(prompt: string, history: Array<{ role: string; text: string }>, searchResults: SearchResult[]) {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    const topSearch = searchResults[0]?.snippet || 'Use active recall by testing yourself before checking the answer.';
    return `Here is a helpful study answer: ${prompt} is best understood by breaking it into key ideas, comparing examples, and testing yourself on the concept. A strong starting point is: ${topSearch}`;
  }

  const context = searchResults.length
    ? `Live references:\n${searchResults
        .slice(0, 2)
        .map((result) => `- ${result.title}: ${result.snippet}`)
        .join('\n')}`
    : 'No live web search was used for this response.';

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `You are Study Buddy, a concise academic tutor. Answer this question using clear explanations suitable for students. Keep the tone friendly and educational.\n\nQuestion: ${prompt}\n\nConversation context: ${history
              .slice(-3)
              .map((item) => `${item.role}: ${item.text}`)
              .join('\n')}\n\n${context}\n\nGive a direct answer with 2-5 practical bullet points or short paragraphs.`,
          },
        ],
      },
    ],
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Gemini request failed');
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text).join(' ') ?? '';

  return text || 'I could not generate an answer from Gemini for this query. Please try again.';
}

async function getSearchResults(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    return [];
  }

  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&engine=google&api_key=${apiKey}&num=4`;

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const results = Array.isArray(data?.organic_results) ? data.organic_results : [];

  return results.map((result: any) => ({
    title: result.title || 'Search result',
    link: result.link || '#',
    snippet: result.snippet || 'Reference from live web search',
  }));
}

type SearchResult = {
  title: string;
  link: string;
  snippet: string;
};
