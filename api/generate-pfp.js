// Vercel Serverless Function Configuration
export const config = {
    // Force this function to run in the US East (Washington, D.C.) region 
    // to bypass EU/UK regional blocks on Google's Imagen API.
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

    // Securely grab the API key from Vercel's Environment Variables
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'Server configuration error: GEMINI_API_KEY environment variable is missing on Vercel.',
            debugDetails: 'Please ensure you added GEMINI_API_KEY (starting with AIzaSy) under Settings > Environment Variables in your Vercel project and redeployed.'
        });
    }

    const { image } = req.body;
    if (!image) {
        return res.status(400).json({ error: 'No image provided in the request body.' });
    }

    try {
        const prompt = "CRITICAL: Preserve the EXACT facial features, identity, and likeness of the original person in the provided image. DO NOT change their face to look like Lionel Messi. Instead, 'GOATify' THIS specific person by doing only the following: 1) Add realistic goat horns growing from their head. 2) Dress them in a light blue and white striped football jersey (Argentina style) with the number 10. 3) Add a glowing neon cyan aura around them. The final image should look like a high-quality digital portrait of the original person cosplaying as the GOAT.";

        // Format payload specifically for the cost-effective Imagen 3 predict endpoint
        const payload = {
            instances: [
                {
                    prompt: prompt,
                    image: {
                        bytesBase64Encoded: image
                    }
                }
            ],
            parameters: {
                sampleCount: 1,
                aspectRatio: "1:1",
                outputMimeType: "image/jpeg"
            }
        };

        // Standard, highly affordable production-supported Imagen 3.0 endpoint in Google AI Studio
        const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
        
        // Forward the request to Google's Imagen API
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
            throw new Error(`Google Imagen API responded with status ${response.status}: ${errorDetails}`);
        }

        const result = await response.json();
        // Extract base64 image data from predictions array
        const generatedImage = result.predictions?.[0]?.bytesBase64Encoded;

        if (!generatedImage) {
            throw new Error("No image returned from Gemini/Imagen. The generation request may have failed safety checks or returned empty.");
        }

        // Send the secure image back to the frontend
        res.status(200).json({ generatedImage });

    } catch (error) {
        console.error("API Route Error:", error);
        // Forward the explicit error message to the frontend for easy debugging
        res.status(500).json({ 
            error: 'Failed to generate image on the server.', 
            message: error.message || error.toString() 
        });
    }
}
