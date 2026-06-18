// Vercel Serverless Function Configuration
export const config = {
    // Force this function to run in the US East (Washington, D.C.) region 
    // to bypass potential regional blocks or restrictions on Google's Gemini API.
    regions: ['iad1'], 
};

export default async function handler(req, res) {
    // Enable CORS (Cross-Origin Resource Sharing) headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,DELETE,PATCH,POST,PUT,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Securely grab the Gemini API key from Vercel's Environment Variables
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'Server configuration error: GEMINI_API_KEY environment variable is missing on Vercel.',
            debugDetails: 'Please ensure you added GEMINI_API_KEY (starting with AIzaSy) under Settings > Environment Variables in your Vercel project and redeployed.'
        });
    }

    try {
        // Safe body parsing inside the try/catch to prevent server crashes
        let body = req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (parseError) {
                return res.status(400).json({ error: 'Invalid JSON body provided.' });
            }
        }

        const image = body?.image;
        if (!image) {
            return res.status(400).json({ error: 'No image provided in the request body.' });
        }

        // Restructured prompt optimized for Gemini 2.5 Flash Image understanding
        const prompt = "CRITICAL: Preserve the EXACT facial features, identity, and likeness of the original person in the provided image. DO NOT change their face. Instead, 'GOATify' THIS specific person by doing only the following: 1) Add realistic curved silver goat horns on their head. 2) Dress them in an Argentina national football team light blue and white striped jersey with the number 10. 3) Place them in a dramatic, glowing football stadium at night with cheering crowds, intense neon cyan lighting, and an electric aura. Replace their original clothes and background completely.";

        // Correct multimodal image generation payload for Gemini 2.5 Flash Image
        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/jpeg", data: image } }
                ]
            }],
            generationConfig: {
                responseModalities: ["IMAGE"]
            }
        };

        // Standard, correct endpoint for gemini-2.5-flash-image-preview
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
        
        // Forward the request to Google
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errorDetails = '';
            try {
                const errJson = await response.json();
                errorDetails = JSON.stringify(errJson);
            } catch (e) {
                errorDetails = await response.text();
            }
            throw new Error(`Google API responded with status ${response.status}: ${errorDetails}`);
        }

        const result = await response.json();
        
        // Extract the generated base64 image data from the multimodal response content parts
        const generatedImage = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

        if (!generatedImage) {
            throw new Error(`No image returned from Gemini 2.5 Flash Image. Full response: ${JSON.stringify(result)}`);
        }

        // Send the secure image back to the frontend
        res.status(200).json({ generatedImage });

    } catch (error) {
        console.error("API Route Error:", error);
        res.status(500).json({ 
            error: 'Failed to generate image on the server using Gemini 2.5.', 
            message: error.message || error.toString() 
        });
    }
}
