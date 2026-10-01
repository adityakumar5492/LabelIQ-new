from app.rag.retriever import search_knowledge


queries = [
    "What is E621?",
    "monosodium glutamate",
    "food preservative sodium benzoate",
    "BHA antioxidant",
    "maltodextrin carbohydrate"
]


for query in queries:

    print()
    print("=" * 60)
    print("QUERY:", query)
    print("=" * 60)

    results = search_knowledge(
        query,
        top_k=2
    )

    for result in results:

        print(
            "Ingredient:",
            result["metadata"].get(
                "ingredient"
            )
        )

        print(
            "Source:",
            result["metadata"].get(
                "source_name"
            )
        )

        print(
            "Distance:",
            result["distance"]
        )

        print(
            result["document"]
        )