const axios = require("axios");
const FormData = require("form-data");

const analyzeImage = async (file) => {
    const formData = new FormData();

    formData.append(
        "file",
        file.buffer,
        {
            filename: file.originalname,
            contentType: file.mimetype,
        }
    );

    const response = await axios.post(
        `${process.env.AI_SERVICE_URL}/scan`,
        formData,
        {
            headers: {
                ...formData.getHeaders(),
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        }
    );

    return response.data;
};

module.exports = {
    analyzeImage,
};