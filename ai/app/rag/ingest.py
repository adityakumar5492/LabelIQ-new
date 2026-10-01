import json
from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer


BASE_DIR = Path(__file__).resolve().parent

DOCUMENTS_FILE = (
    BASE_DIR
    / "documents"
    / "ingredients.json"
)

VECTOR_STORE_DIR = (
    BASE_DIR
    / "vector_store"
)

COLLECTION_NAME = "ingredient_knowledge"


def load_documents():
    with open(
        DOCUMENTS_FILE,
        "r",
        encoding="utf-8"
    ) as file:
        return json.load(file)


def create_search_text(document):
    aliases = ", ".join(
        document.get("aliases", [])
    )

    return f"""
Ingredient: {document.get("ingredient", "")}

Aliases:
{aliases}

Category:
{document.get("category", "")}

Description:
{document.get("description", "")}

Health context:
{document.get("health_context", "")}

Label guidance:
{document.get("label_guidance", "")}
""".strip()


def main():

    print("Loading embedding model...")

    model = SentenceTransformer(
        "all-MiniLM-L6-v2"
    )

    print("Loading knowledge documents...")

    documents = load_documents()

    client = chromadb.PersistentClient(
        path=str(VECTOR_STORE_DIR)
    )

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={
            "description":
                "LabelIQ ingredient knowledge base"
        }
    )

    ids = []
    texts = []
    metadatas = []

    for index, document in enumerate(documents):

        ingredient = document["ingredient"]

        ids.append(
            f"ingredient_{index}"
        )

        texts.append(
            create_search_text(document)
        )

        metadatas.append({
            "ingredient": ingredient,

            "aliases": ", ".join(
                document.get(
                    "aliases",
                    []
                )
            ),

            "category": document.get(
                "category",
                ""
            ),

            "source_name": document.get(
                "source_name",
                ""
            ),

            "source_url": document.get(
                "source_url",
                ""
            ),
        })

    print("Creating embeddings...")

    embeddings = model.encode(
        texts,
        normalize_embeddings=True
    ).tolist()

    collection.upsert(
        ids=ids,
        documents=texts,
        embeddings=embeddings,
        metadatas=metadatas
    )

    print()
    print(
        f"Indexed {len(documents)} documents."
    )

    print(
        f"Vector store: {VECTOR_STORE_DIR}"
    )

    print(
        f"Collection: {COLLECTION_NAME}"
    )


if __name__ == "__main__":
    main()
