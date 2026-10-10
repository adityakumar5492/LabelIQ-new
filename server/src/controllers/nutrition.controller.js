const Product = require("../models/product.model");
const nutritionService = require("../services/nutrition.service");

const analyzeProductNutrition = async (
    req,
    res,
    next
) => {
    try {
        const { productId } = req.params;

        const product =
            await Product.findById(productId);

        if (!product) {
            const error = new Error(
                "Product not found"
            );

            error.statusCode = 404;
            throw error;
        }

        const goal =
            req.user?.preferences?.goal ||
            "general";

        const requestedServings =
            req.query.servings;

        const servings =
            requestedServings === undefined
                ? 1
                : Number(requestedServings);

        if (
            !Number.isFinite(servings) ||
            servings <= 0
        ) {
            const error = new Error(
                "Servings must be a positive number."
            );

            error.statusCode = 400;
            throw error;
        }

        const servingsPerPackage =
            nutritionService.calculateServingsPerPackage(
                product.servingSize,
                product.packageSize
            );

        /*
         * IMPORTANT:
         * The product's nutrition is the raw label
         * nutrition, which may be per-100g, per-100ml,
         * per-piece, or per-serving.
         *
         * Convert it to actual per-serving nutrition
         * before running any analysis.
         *
         * Example:
         * Label = 500 kcal / 100g
         * Serving = 20g
         * -> servingNutrition = 100 kcal
         */
        const nutritionData =
            nutritionService.prepareNutritionData({
                nutrition:
                    product.nutrition || {},

                nutritionBasis:
                    product.nutritionBasis ||
                    "per-serving",

                servingSize:
                    product.servingSize,

                packageSize:
                    product.packageSize,
            });

        /*
         * Multi-serving analysis must be based on the
         * converted per-serving nutrition, never the
         * raw label values.
         */
        const analysis =
            nutritionService.analyzeMultiServingNutrition(
                {
                    nutrition:
                        nutritionData.servingNutrition,
                    servings,
                    goal,
                }
            );

        res.status(200).json({
            success: true,
            data: {
                product: {
                    id: product._id,
                    name: product.name,
                    brand: product.brand,
                    servingSize:
                        product.servingSize,
                    packageSize:
                        product.packageSize,
                    servingsPerPackage,
                },

                nutritionBasis:
                    product.nutritionBasis ||
                    "per-serving",

                /*
                 * Original label values, untouched.
                 */
                originalNutrition:
                    nutritionData.originalNutrition,

                /*
                 * Converted nutrition for one serving.
                 */
                servingNutrition:
                    nutritionData.servingNutrition,

                /*
                 * Converted nutrition for the whole
                 * package (null if not calculable).
                 */
                packageNutrition:
                    nutritionData.packageNutrition,

                /*
                 * Nutrition for the requested number of
                 * servings (defaults to 1 serving, which
                 * equals servingNutrition).
                 */
                nutrition:
                    analysis.nutrition,

                servings:
                    analysis.servings,

                analysis:
                    analysis.analysis,
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    analyzeProductNutrition,
};