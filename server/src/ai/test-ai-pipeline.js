require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { analyzeImage } = require("./pipeline/ai-pipeline.service");

async function test() {
    const imagePath = path.join(
        __dirname,
        "../../../test-image.jpg"
    );

    const imageBuffer = fs.readFileSync(imagePath);

    const result = await analyzeImage(imageBuffer);

    console.log(
        JSON.stringify(result, null, 2)
    );
}

test().catch((error) => {
    console.error("AI pipeline test failed:");
    console.error(error);
});