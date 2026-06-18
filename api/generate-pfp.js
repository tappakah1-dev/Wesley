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

        // Heavy front-loading of visual elements in the prompt so SDXL processes them with top priority.
        const prompt = "A highly detailed, epic professional sports portrait of the person. They are wearing majestic, large curved silver goat horns on their head, and wearing an Argentina national football team light blue and white striped jersey with the number 10. Set against a dramatic, glowing Argentina football stadium background with cheering fans, intense neon cyan lighting, and an electric aura. Maintain the exact face direction, pose, features, and identity of the person from the input image, but completely replace their clothes and background.";
        
        // Negative prompt to strictly forbid returning the original background or unedited clothing
        const negativePrompt = "original background, plain background, original clothing, unedited clothes, human head with no horns, bad quality, blurry, deformed anatomy";

        // Call the dedicated image-to-image endpoint synchronously
        const response = await fetch("https://fal.run/fal-ai/fast-sdxl/image-to-image", {
            method: "POST",
            headers: {
                "Authorization": `Key ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                image_url: `data:image/jpeg;base64,${image}`,
                prompt: prompt,
                negative_prompt: negativePrompt,
                strength: 0.78, // Increased to 0.78 to give the AI optimal freedom to replace the shirt and background, while preserving the face structure
                guidance_scale: 8.5, // Increased guidance scale to force strict adherence to the new prompt parameters
                num_inference_steps: 35
            })
        });

        if (!response.ok) {
            const errorDetails = await response.text();
            throw new Error(`Fal.ai API responded with status ${response.status}: ${errorDetails}`);
        }

        let result = await response.json();

        // Fallback: If Fal.ai forces the request into a queue, we poll the queue status until complete
        if (result.status === "IN_QUEUE" || result.status_url) {
            const statusUrl = result.status_url;
            const responseUrl = result.response_url;
            let completed = false;
            let attempts = 0;
            const maxAttempts = 15; // Wait up to 15 seconds

            while (!completed && attempts < maxAttempts) {
                // Wait 1 second between checks
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;

                const statusResponse = await fetch(statusUrl, {
                    headers: { "Authorization": `Key ${apiKey}` }
                });

                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    if (statusData.status === "COMPLETED") {
                        completed = true;
                    } else if (statusData.status === "FAILED") {
                        throw new Error(`Fal.ai generation failed inside the processing queue.`);
                    }
                }
            }

            if (!completed) {
                throw new Error("Fal.ai processing queue timed out (took longer than 15 seconds).");
            }

            // Fetch the final finished output once queue is completed
            const finalResponse = await fetch(responseUrl, {
                headers: { "Authorization": `Key ${apiKey}` }
            });
            if (!finalResponse.ok) {
                throw new Error("Failed to retrieve final image payload from Fal.ai queue.");
            }
            result = await finalResponse.json();
        }

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
