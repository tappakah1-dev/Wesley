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

    // Securely grab the Fal.ai API key from Vercel's Environment Variables
    const apiKey = process.env.FAL_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'Server configuration error: FAL_KEY environment variable is missing on Vercel.',
            debugDetails: 'Please ensure you added FAL_KEY under Settings > Environment Variables in your Vercel project and redeployed.'
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

        const prompt = "Preserve the facial features and head orientation of the person in the input image. Add a high-quality, artistic, decorative silver goat horns accessory on their head. Dress them in an Argentina national football team light blue and white striped jersey with the number 10, surrounded by a glowing neon cyan aura. High-quality digital art, epic studio portrait, matching lighting.";

        // Call the dedicated image-to-image endpoint synchronously
        const response = await fetch("https://queue.fal.run/fal-ai/fast-sdxl/image-to-image?sync_mode=true", {
            method: "POST",
            headers: {
                "Authorization": `Key ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                image_url: `data:image/jpeg;base64,${image}`,
                prompt: prompt,
                strength: 0.45 // Keeps 55% of the original facial likeness while adding horns, jersey & glow
            })
        });

        if (!response.ok) {
            const errorDetails = await response.text();
            throw new Error(`Fal.ai API responded with status ${response.status}: ${errorDetails}`);
        }

        const result = await response.json();
        const imageUrl = result.images?.[0]?.url;

        if (!imageUrl) {
            throw new Error(`No image URL returned from Fal.ai. Full API response: ${JSON.stringify(result)}`);
        }

        // Fetch the generated image and convert it directly to Base64 (safely wrapped in Uint8Array)
        const imgBuffer = await fetch(imageUrl).then(res => res.arrayBuffer());
        const base64Image = Buffer.from(new Uint8Array(imgBuffer)).toString('base64');

        res.status(200).json({ generatedImage: base64Image });

    } catch (error) {
        console.error("API Route Error:", error);
        res.status(500).json({ 
            error: 'Failed to generate image on the server using Fal.ai.', 
            message: error.message || error.toString() 
        });
    }
}
