const { spawn } = require("child_process");
const path = require("path");

const getPythonPath = () => {
    const isWindows = process.platform === "win32";

    return path.join(
        __dirname,
        "../../../ai/venv",
        isWindows ? "Scripts/python.exe" : "bin/python"
    );
};

const runPythonScript = ({
    scriptPath,
    input,
}) => {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn(
            getPythonPath(),
            [scriptPath]
        );

        let output = "";
        let errorOutput = "";

        pythonProcess.stdout.on("data", (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                return reject(
                    new Error(
                        errorOutput ||
                            "Python process failed"
                    )
                );
            }

            try {
                const result = JSON.parse(output);
                resolve(result);
            } catch (error) {
                console.error(
                    "Python output:",
                    output
                );

                reject(
                    new Error(
                        "Invalid response from Python"
                    )
                );
            }
        });

        pythonProcess.on("error", (error) => {
            reject(error);
        });

        if (input !== undefined) {
            pythonProcess.stdin.write(
                JSON.stringify(input)
            );
            pythonProcess.stdin.end();
        }
    });
};

const runRag = ({
    question = null,
    product = null,
    userPreferences = null,
    nutritionAnalysis = null,
    evidenceOnly = false,
} = {}) => {
    const scriptPath = path.join(
        __dirname,
        "../../../ai/rag/api.py"
    );

    return runPythonScript({
        scriptPath,
        input: {
            question,
            product,
            userPreferences,
            nutritionAnalysis,
            evidenceOnly,
        },
    });
};

const runExtraction = ({
    imageBuffer,
    mimeType,
} = {}) => {
    return new Promise((resolve, reject) => {
        if (!imageBuffer) {
            return reject(
                new Error("Image is required.")
            );
        }

        const scriptPath = path.join(
            __dirname,
            "../../../ai/extraction/extract.py"
        );

        const input = {
            imageBase64:
                imageBuffer.toString("base64"),
            mimeType,
        };

        const pythonProcess = spawn(
            getPythonPath(),
            [scriptPath]
        );

        let output = "";
        let errorOutput = "";

        pythonProcess.stdout.on("data", (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        pythonProcess.on("close", (code) => {
            if (errorOutput) {
                console.error(
                    "Python extraction stderr:\n" +
                        errorOutput
                );
            }

            if (code !== 0) {
                return reject(
                    new Error(
                        errorOutput ||
                            "Python extraction failed"
                    )
                );
            }

            try {
                const result = JSON.parse(output);
                resolve(result);
            } catch (error) {
                console.error(
                    "Python extraction output:",
                    output
                );

                reject(
                    new Error(
                        "Invalid extraction response from Python"
                    )
                );
            }
        });

        pythonProcess.on("error", (error) => {
            reject(error);
        });

        // Keep image data in stdin.
        // This avoids Windows ENAMETOOLONG and also
        // works correctly on Render/Linux.
        pythonProcess.stdin.write(
            JSON.stringify(input)
        );

        pythonProcess.stdin.end();
    });
};

module.exports = {
    runRag,
    runExtraction,
};