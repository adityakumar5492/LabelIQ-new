from app.services.rag_service import get_ingredient_evidence


TEST_INGREDIENTS = [
    "E621",
    "MSG",
    "monosodium glutamate",
    "621",
    "E320",
    "BHA",
    "Maltodextrin",
    "Palm Oil",
    "Glucose Syrup",
    "Palm Fat",
    "Sugar",
    "Milk Chocolate",
    "Soy Lecithin",
]


def run_test(ingredient: str):
    print("\n" + "=" * 60)
    print(f"Ingredient: {ingredient}")

    evidence = get_ingredient_evidence(ingredient)

    if not evidence:
        print("Result: NO TRUSTED EVIDENCE")
        return

    for item in evidence:
        print(f"Matched ingredient : {item['ingredient']}")
        print(f"Source              : {item['source_name']}")
        print(f"Distance            : {item['distance']}")
        print(f"URL                 : {item['source_url']}")
        print(f"Evidence            : {item['evidence'][:200]}...")


if __name__ == "__main__":

    for ingredient in TEST_INGREDIENTS:
        run_test(ingredient)