export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Securely grab the API key from Vercel's Environment Variables
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    }

    const { image } = req.body;
    if (!image) {
        return res.status(400).json({ error: 'No image provided.' });
    }

    try {
        const prompt = "CRITICAL: Preserve the EXACT facial features, identity, and likeness of the original person in the provided image. DO NOT change their face to look like Lionel Messi. Instead, 'GOATify' THIS specific person by doing only the following: 1) Add realistic goat horns growing from their head. 2) Dress them in a light blue and white striped football jersey (Argentina style) with the number 10. 3) Add a glowing neon cyan aura around them. The final image should look like a high-quality digital portrait of the original person cosplaying as the GOAT.";

        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/jpeg", data: image } }
                ]
            }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
        
        // Forward the request to Google
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Google API responded with status: ${response.status}`);
        }

        const result = await response.json();
        const generatedImage = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

        if (!generatedImage) {
            throw new Error("No image returned from Gemini.");
        }

        // Send the secure image back to the frontend
        res.status(200).json({ generatedImage });

    } catch (error) {
        console.error("API Route Error:", error);
        res.status(500).json({ error: 'Failed to generate image on the server.' });
    }
}
