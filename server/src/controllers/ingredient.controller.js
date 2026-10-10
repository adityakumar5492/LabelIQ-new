const Product = require("../models/product.model");
const ingredientService = require("../services/ingredient.service");
const pythonService = require("../services/python.service");

const analyzeProductIngredients = async (req, res, next) => {
    try {
        const { productId } = req.params;

        const product = await Product.findById(productId);

        if (!product) {
            const error = new Error("Product not found");
            error.statusCode = 404;
            throw error;
        }

        const ragResult = await pythonService.runRag({
            product: {
                name: product.name,
                brand: product.brand,
                category: product.category,
                servingSize: product.servingSize,
                nutrition: product.nutrition,
                ingredients: product.ingredients,
            },
            evidenceOnly: true,
        });

        const evidence = ragResult?.evidence || {};

        const trustedEvidence = {};

        const pushEvidence = (normalizedName, entry) => {
            if (!trustedEvidence[normalizedName]) {
                trustedEvidence[normalizedName] = [];
            }

            trustedEvidence[normalizedName].push(entry);
        };

        /*
         * -----------------------------------------------------
         * Trusted external evidence (evidence.external, FDA etc.)
         * -----------------------------------------------------
         * NOTE ON ORDER: this is processed BEFORE evidence.local
         * on purpose. Ingredients with both local-KB and FDA
         * evidence get an array like [externalEntry, localEntry].
         * Keeping the FDA entry (which carries technicalEffects /
         * possibleUses) at index 0 preserves the existing
         * "possible food uses" display for ingredients that have
         * both, and avoids the local entry (whose possibleUses is
         * always empty) shadowing it.
         */
        for (const item of evidence.external || []) {
            if (!item || typeof item !== "object") {
                continue;
            }

            const ingredientName = item.ingredient;

            if (!ingredientName) {
                continue;
            }

            const normalizedName =
                ingredientService.normalizeIngredientName(
                    ingredientName
                );

            const source = item.source || {};

            const sourceName =
                (typeof source.source === "string" && source.source) ||
                (typeof source.sourceName === "string" && source.sourceName) ||
                null;

            const sourceType =
                source.type ||
                source.sourceType ||
                null;

            const sourceUrl =
                source.url ||
                null;

            const technicalEffects =
                Array.isArray(source.technicalEffects)
                    ? source.technicalEffects
                    : [];

            pushEvidence(normalizedName, {
                possibleUses: technicalEffects,

                source: {
                    sourceName,
                    sourceType,
                    url: sourceUrl,
                },
            });
        }

        /*
         * -----------------------------------------------------
         * Local knowledge-base evidence (evidence.local)
         * -----------------------------------------------------
         * Appended after external/FDA evidence (see note above).
         * This is still what makes ingredients with ONLY local
         * evidence (no FDA match) show up as "information
         * available" instead of being silently dropped.
         */
        for (const result of evidence.local || []) {
            const document = result?.document;

            if (!document || !document.name) {
                continue;
            }

            const normalizedName =
                ingredientService.normalizeIngredientName(
                    document.name
                );

            pushEvidence(normalizedName, {
                description: document.description || null,
                possibleUses: [],

                source: {
                    sourceName:
                        document.source ||
                        "LabelIQ knowledge base",
                    sourceType: "local-knowledge-base",
                    url: null,
                },
            });
        }

        const ingredients =
            ingredientService.analyzeIngredients(
                product.ingredients,
                trustedEvidence
            );

        res.status(200).json({
            success: true,
            data: {
                product: {
                    id: product._id,
                    name: product.name,
                    brand: product.brand,
                },
                ingredients,
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    analyzeProductIngredients,
};